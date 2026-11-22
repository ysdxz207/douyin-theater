(() => {
  let fallbackPlayer = null;
  let modeSession = null;
  let playerObserver = null;
  let pageObserver = null;

  function visibleArea(element) {
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    return width * height;
  }

  function textOf(element) {
    return (element?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function labelsOf(element) {
    if (!element) return '';
    return [
      element.getAttribute?.('aria-label'),
      element.getAttribute?.('title'),
      element.getAttribute?.('data-e2e'),
      textOf(element),
    ].filter(Boolean).join(' ');
  }

  function findControl(root, pattern) {
    const controls = [...root.querySelectorAll('button, [role="button"], [role="switch"], [aria-checked]')];
    return controls.find(control => {
      for (let node = control, depth = 0; node && depth < 4; node = node.parentElement, depth += 1) {
        if (pattern.test(labelsOf(node))) return true;
      }
      return false;
    }) || null;
  }

  function dismissBlockingGuide() {
    const button = [...document.querySelectorAll('button')].find(candidate => {
      if (textOf(candidate) !== '我知道了') return false;
      for (let node = candidate, depth = 0; node && depth < 8; node = node.parentElement, depth += 1) {
        if (/滚动.*查看更多推荐视频|键盘上下键.*切换视频/.test(textOf(node))) return true;
      }
      return false;
    });
    button?.click();
  }

  function playerRoot(video) {
    for (let node = video?.parentElement, depth = 0; node && depth < 10; node = node.parentElement, depth += 1) {
      const text = textOf(node);
      if (/清屏/.test(text) && /连播/.test(text) && node.querySelector('video') === video) return node;
    }
    return video?.closest('.xgplayer') || video?.parentElement || null;
  }

  function playerCandidates() {
    return [...document.querySelectorAll('video')]
      .map(video => ({ video, player: playerRoot(video) }))
      .filter(entry => entry.player);
  }

  function playerScore(entry) {
    const { video, player } = entry;
    const rect = video.getBoundingClientRect();
    const inViewport = rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    const playing = !video.paused && video.readyState >= 2;
    const notWaiting = !/nostart|loading/i.test(String(player.className || ''));
    const centerDistance = Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2);
    return (playing ? 1e12 : 0) + (inViewport ? 1e9 : 0) + (notWaiting ? 1e6 : 0) + visibleArea(video) - centerDistance;
  }

  function activePlayer() {
    const candidates = playerCandidates();
    if (candidates.length) return candidates.sort((a, b) => playerScore(b) - playerScore(a))[0].player;
    const fallback = [...document.querySelectorAll('.xgplayer')].filter(player => visibleArea(player) > 0);
    return fallback.sort((a, b) => visibleArea(b) - visibleArea(a))[0] || null;
  }

  function clearScreen(player) {
    const control = findControl(player, /清屏/);
    const label = [...player.querySelectorAll('.xgTips')].map(textOf).find(text => text.includes('取消清屏')) || '';
    return player.classList.contains('immersive-player-switch-on') ||
      control?.classList.contains('xg-switch-checked') ||
      label.includes('取消清屏');
  }

  function setClearScreen(player, enabled) {
    if (clearScreen(player) !== enabled) {
      findControl(player, /清屏/)?.click();
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
    if (/智能/.test(text)) return 0;
    return -1;
  }

  function qualityOptions(player) {
    const groups = [...player.querySelectorAll('div, ul, ol')]
      .map(group => [...group.children])
      .filter(children => children.length >= 2 && children.length <= 12 &&
        children.every(item => qualityScore(textOf(item)) >= 0 && visibleArea(item) > 0));
    const semantic = groups.sort((a, b) => b.length - a.length)[0];
    if (semantic) return semantic;
    return [...player.querySelectorAll('.xgplayer-playclarity-setting .item')]
      .filter(item => visibleArea(item) > 0);
  }

  function qualityControl(player) {
    const label = [...player.querySelectorAll('*')]
      .filter(item => /^(智能|高清|超清|蓝光|4K|2K|画质|清晰度)(画质)?$/i.test(textOf(item)) && visibleArea(item) > 0)
      .sort((a, b) => visibleArea(a) - visibleArea(b))[0];
    return label?.closest('button, [role="button"], [role="switch"], [aria-checked]') || label || null;
  }

  function setHighestQuality(player) {
    const options = qualityOptions(player)
      .map(item => ({ item, score: qualityScore(item.textContent || '') }))
      .filter(option => option.score >= 0 &&
        option.item.getAttribute('aria-disabled') !== 'true' &&
        !option.item.disabled &&
        !/登录即享|登录后|不可用/.test(textOf(option.item)));
    if (!options.length) {
      qualityControl(player)?.click();
      return;
    }
    const highest = options.reduce((best, option) => option.score > (best?.score ?? -1) ? option : best, null);
    if (highest && !highest.item.classList.contains('selected')) highest.item.click();
  }

  function continuousEnabled(player) {
    const control = findControl(player, /连播/);
    const tips = [...player.querySelectorAll('.xgTips')].map(textOf);
    return Boolean(control?.classList.contains('xg-switch-checked')) ||
      control?.getAttribute('aria-checked') === 'true' ||
      tips.some(text => text.includes('关闭自动连播'));
  }

  function setContinuous(player, enabled) {
    if (continuousEnabled(player) !== enabled) {
      findControl(player, /连播/)?.click();
    }
  }

  function collectionScope(player) {
    const legacy = player.closest('#slideMode, .slideMode');
    if (legacy) return legacy;
    const modern = player.closest('[data-e2e="slideList"], #slidelist');
    if (modern) return modern;

    for (let node = player.parentElement, depth = 0; node && depth < 8; node = node.parentElement, depth += 1) {
      if (node.querySelectorAll('video').length > 1) return node;
    }
    return null;
  }

  function collectionTab(player) {
    const scope = collectionScope(player);
    if (!scope) return null;
    return scope.querySelector('#semiTabcompilation_card') ||
      [...scope.querySelectorAll('[role="tab"], button, [role="button"], a')]
        .find(item => /^合集$/.test(textOf(item))) || null;
  }

  function hasCollection(player) {
    const scope = collectionScope(player);
    if (!scope) return false;
    return /合集/.test(textOf(scope)) && /第\s*\d+\s*集|更新至/.test(textOf(scope));
  }

  function selectCollection(player) {
    const tab = collectionTab(player);
    if (tab?.getAttribute('aria-selected') !== 'true') tab?.click();
    return Boolean(tab || hasCollection(player));
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

    if (document.fullscreenElement === player || fallbackPlayer === player) return;
    setFallback(player, true);
    try {
      if (!player.requestFullscreen) return;
      player.requestFullscreen().catch(() => {});
    } catch {
      // The CSS fallback is already active.
    }
  }

  function selectedQuality(player) {
    return qualityOptions(player).find(item => item.classList.contains('selected'))?.textContent.trim() || null;
  }

  function restoreQuality(player, label) {
    if (!label) return;
    const option = qualityOptions(player).find(item => textOf(item) === label);
    if (option && !option.classList.contains('selected')) option.click();
  }

  function playerState(player) {
    const scope = collectionScope(player);
    return {
      player,
      restoreDanmaku: player.classList.contains('douyin-theater-no-danmaku'),
      restoreClear: clearScreen(player),
      restoreContinuous: continuousEnabled(player),
      restoreQuality: selectedQuality(player),
      restoreTab: scope?.querySelector('[role="tab"][aria-selected="true"]') || null,
    };
  }

  function applyPlaybackSettings(player, settings) {
    player.classList.toggle('douyin-theater-no-danmaku', settings.danmaku);
    setClearScreen(player, settings.clearScreen);
    setHighestQuality(player, settings.quality);
    setContinuous(player, settings.continuous);
  }

  function observePlayer(player) {
    playerObserver?.disconnect();
    playerObserver = new MutationObserver(scheduleModeRefresh);
    playerObserver.observe(player, {
      attributes: true,
      attributeFilter: ['class', 'src'],
      childList: true,
      subtree: true,
    });

    pageObserver?.disconnect();
    pageObserver = new MutationObserver(() => {
      dismissBlockingGuide();
      if (modeSession && activePlayer() !== modeSession.player) scheduleModeRefresh();
    });
    if (document.body) {
      pageObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function scheduleModeRefresh() {
    if (!modeSession || modeSession.refreshTimer) return;
    modeSession.refreshTimer = setTimeout(() => {
      if (!modeSession) return;
      modeSession.refreshTimer = null;
      const player = activePlayer();
      if (!player) return;

      if (player !== modeSession.player) {
        const restoreTab = modeSession.restoreTab;
        Object.assign(modeSession, playerState(player), { restoreTab });
        observePlayer(player);
      }
      applyPlaybackSettings(player, modeSession.settings);
      if (modeSession.settings.fullscreen) setFullscreen(player, true);
    }, 120);
  }

  function onVideoChange(event) {
    if (event.target instanceof HTMLVideoElement) scheduleModeRefresh();
  }

  for (const eventName of ['emptied', 'loadedmetadata', 'loadeddata', 'play']) {
    document.addEventListener(eventName, onVideoChange, true);
  }
  document.addEventListener('scroll', scheduleModeRefresh, true);

  function applySettings(settings) {
    if (modeSession) return { ok: false, error: '追剧模式已开启' };
    dismissBlockingGuide();
    const player = activePlayer();
    if (!player) return { ok: false, error: '找不到当前播放视频' };

    modeSession = {
      ...playerState(player),
      settings: { ...settings },
      refreshTimer: null,
      fullscreenRequested: settings.fullscreen && document.fullscreenElement !== player,
    };

    // Request fullscreen before clicking the collection tab, which can rerender the player.
    if (settings.fullscreen) setFullscreen(player, true);
    applyPlaybackSettings(player, settings);
    observePlayer(player);
    const collectionFound = selectCollection(player);
    return { ok: true, collectionFound, modeOn: true };
  }

  function exitMode() {
    if (!modeSession) return { ok: true, modeOn: false };
    const session = modeSession;
    modeSession = null;
    const { player } = session;
    clearTimeout(session.refreshTimer);
    playerObserver?.disconnect();
    pageObserver?.disconnect();

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
      sendResponse({ ok: true, hasPlayer: Boolean(player), hasCollection: Boolean(player && (collectionTab(player) || hasCollection(player))), modeOn: Boolean(modeSession) });
    }
    if (message?.type === 'apply-settings-v2') sendResponse(applySettings(message.settings));
    if (message?.type === 'exit-mode-v2') sendResponse(exitMode());
  }

  chrome.runtime.onMessage.addListener(onMessage);

  document.addEventListener('fullscreenchange', () => {
    if (fallbackPlayer && document.fullscreenElement === fallbackPlayer) {
      setFallback(fallbackPlayer, false);
    }
    if (modeSession?.fullscreenRequested && !document.fullscreenElement && !fallbackPlayer) exitMode();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && fallbackPlayer) exitMode();
  });
})();
