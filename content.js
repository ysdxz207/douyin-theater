(() => {
  let fallbackPlayer = null;
  let modeSession = null;

  function visibleArea(element) {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    return width * height;
  }

  function activePlayer() {
    const modal = document.querySelector('#slideMode');
    const scoped = [...(modal?.querySelectorAll('.xgplayer') || [])];
    const candidates = scoped.length ? scoped : [...document.querySelectorAll('.xgplayer')];
    const visible = candidates.filter(player => visibleArea(player) > 0);
    return (visible.length ? visible : candidates).sort((a, b) => visibleArea(b) - visibleArea(a))[0];
  }

  function clearScreen(player) {
    const label = player.querySelector('.xgplayer-immersive-switch-setting .xgTips')?.textContent || '';
    return player.classList.contains('immersive-player-switch-on') || label.includes('取消清屏');
  }

  function setClearScreen(player, enabled) {
    if (clearScreen(player) !== enabled) {
      player.querySelector('.xgplayer-immersive-switch-setting button')?.click();
    }
  }

  function qualityScore(text) {
    if (/\b4k\b/i.test(text)) return 2160;
    if (/\b2k\b/i.test(text)) return 1440;
    const resolution = text.match(/(\d{3,4})\s*p?/i);
    if (resolution) return Number(resolution[1]);
    if (/超清|蓝光/.test(text)) return 3000;
    if (/高清/.test(text)) return 1080;
    if (/标清/.test(text)) return 540;
    return -1;
  }

  function setHighestQuality(player) {
    const options = [...player.querySelectorAll('.xgplayer-playclarity-setting .item')]
      .map(item => ({ item, score: qualityScore(item.textContent || '') }))
      .filter(option => option.score >= 0);
    const highest = options.reduce((best, option) => option.score > (best?.score ?? -1) ? option : best, null);
    if (highest && !highest.item.classList.contains('selected')) highest.item.click();
  }

  function continuousEnabled(player) {
    const setting = player.querySelector('.xgplayer-autoplay-setting');
    return Boolean(setting?.querySelector('.xg-switch')?.classList.contains('xg-switch-checked')) ||
      Boolean(setting?.querySelector('.xgTips')?.textContent.includes('关闭自动连播'));
  }

  function setContinuous(player, enabled) {
    if (continuousEnabled(player) !== enabled) {
      player.querySelector('.xgplayer-autoplay-setting .xg-switch')?.click();
    }
  }

  function collectionScope(player) {
    return player.closest('#slideMode') || player.closest('.slideMode');
  }

  function collectionTab(player) {
    const scope = collectionScope(player);
    if (!scope) return null;
    return scope.querySelector('#semiTabcompilation_card') ||
      [...scope.querySelectorAll('[role="tab"]')].find(item => item.textContent.trim() === '合集') || null;
  }

  function selectCollection(player) {
    const tab = collectionTab(player);
    if (tab?.getAttribute('aria-selected') !== 'true') tab?.click();
    return Boolean(tab);
  }

  function setFallback(player, enabled) {
    fallbackPlayer = enabled ? player : null;
    player.classList.toggle('douyin-theater-fallback', enabled);
    document.body.classList.toggle('douyin-theater-fallback-active', enabled);
  }

  function setFullscreen(player, enabled) {
    if (!enabled) {
      if (document.fullscreenElement === player) document.exitFullscreen();
      setFallback(player, false);
      return;
    }

    if (document.fullscreenElement === player) return;
    try {
      if (!player.requestFullscreen) return setFallback(player, true);
      player.requestFullscreen().catch(() => setFallback(player, true));
    } catch {
      setFallback(player, true);
    }
  }

  function selectedQuality(player) {
    return player.querySelector('.xgplayer-playclarity-setting .item.selected')?.textContent.trim() || null;
  }

  function restoreQuality(player, label) {
    if (!label) return;
    const option = [...player.querySelectorAll('.xgplayer-playclarity-setting .item')]
      .find(item => item.textContent.trim() === label);
    if (option && !option.classList.contains('selected')) option.click();
  }

  function applySettings(settings) {
    if (modeSession) return { ok: false, error: '追剧模式已开启' };
    const player = activePlayer();
    if (!player) return { ok: false, error: '找不到当前播放视频' };

    const scope = collectionScope(player);
    modeSession = {
      player,
      restoreDanmaku: player.classList.contains('douyin-theater-no-danmaku'),
      restoreClear: clearScreen(player),
      restoreContinuous: continuousEnabled(player),
      restoreQuality: selectedQuality(player),
      restoreTab: scope?.querySelector('[role="tab"][aria-selected="true"]') || null,
      fullscreenRequested: settings.fullscreen && document.fullscreenElement !== player,
    };

    // Request fullscreen before clicking the collection tab, which can rerender the player.
    if (settings.fullscreen) setFullscreen(player, true);
    player.classList.toggle('douyin-theater-no-danmaku', settings.danmaku);
    setClearScreen(player, settings.clearScreen);
    setHighestQuality(player, settings.quality);
    setContinuous(player, settings.continuous);
    const collectionFound = selectCollection(player);
    return { ok: true, collectionFound, modeOn: true };
  }

  function exitMode() {
    if (!modeSession) return { ok: true, modeOn: false };
    const session = modeSession;
    modeSession = null;
    const { player } = session;

    if (session.fullscreenRequested && document.fullscreenElement === player) document.exitFullscreen();
    setFallback(player, false);
    player.classList.toggle('douyin-theater-no-danmaku', session.restoreDanmaku);
    setClearScreen(player, session.restoreClear);
    setContinuous(player, session.restoreContinuous);
    restoreQuality(player, session.restoreQuality);
    if (session.restoreTab?.isConnected && session.restoreTab.getAttribute('aria-selected') !== 'true') {
      session.restoreTab.click();
    }
    return { ok: true, modeOn: false };
  }

  function onMessage(message, _sender, sendResponse) {
    if (message?.type === 'ping') {
      const player = activePlayer();
      sendResponse({ ok: true, hasPlayer: Boolean(player), hasCollection: Boolean(player && collectionTab(player)), modeOn: Boolean(modeSession) });
    }
    if (message?.type === 'apply-settings-v2') sendResponse(applySettings(message.settings));
    if (message?.type === 'exit-mode-v2') sendResponse(exitMode());
  }

  chrome.runtime.onMessage.addListener(onMessage);

  document.addEventListener('fullscreenchange', () => {
    if (fallbackPlayer && document.fullscreenElement === fallbackPlayer) {
      setFallback(fallbackPlayer, false);
    }
    if (modeSession?.fullscreenRequested && !document.fullscreenElement) exitMode();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && fallbackPlayer) exitMode();
  });
})();
