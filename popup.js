const DEFAULTS = { danmaku: true, clearScreen: true, quality: true, continuous: true, fullscreen: true };
const controls = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, document.getElementById(key)]));
const applyButton = document.getElementById('apply');
const status = document.getElementById('page-status');
const statusText = document.getElementById('status-text');
const applyLabel = document.querySelector('.apply-label');
const applySwitch = document.querySelector('.apply-switch');
let activeTabId;
let targetWasActive = false;
let modeOn = false;

async function connect(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'ping' });
  } catch {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['theater.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return chrome.tabs.sendMessage(tabId, { type: 'ping' });
  }
}

function setModeState(enabled) {
  modeOn = enabled;
  applyButton.dataset.on = String(enabled);
  applySwitch.dataset.on = String(enabled);
  applyLabel.textContent = enabled ? '退出追剧模式' : '进入追剧模式';
}

async function initialize() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  for (const [key, control] of Object.entries(controls)) {
    control.checked = settings[key];
    control.addEventListener('change', () => {
      chrome.storage.local.set({ [key]: control.checked });
    });
  }

  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const douyinTabs = await chrome.tabs.query({ url: 'https://www.douyin.com/*' });
  const target = douyinTabs.find(tab => tab.id === currentTab?.id) ||
    douyinTabs.filter(tab => tab.url?.includes('modal_id=')).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] ||
    douyinTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];

  if (!target?.id) {
    status.dataset.ready = 'false';
    statusText.textContent = '没找到已打开的抖音标签页';
    return;
  }

  activeTabId = target.id;
  targetWasActive = target.active === true;
  try {
    const result = await connect(activeTabId);
    setModeState(result?.modeOn);
    if (!result?.hasPlayer) {
      status.dataset.ready = 'false';
      statusText.textContent = '尚未找到播放器；可直接点大开关重试';
      applyButton.disabled = false;
      return;
    }
    status.dataset.ready = 'true';
    statusText.textContent = !result.hasCollection
      ? '视频已连接；未发现明确关联合集'
      : targetWasActive ? '抖音视频与合集已连接' : '已找到合集，应用时会切换过去';
    applyButton.disabled = false;
  } catch {
    status.dataset.ready = 'false';
    statusText.textContent = '无法连接当前抖音页；请重新加载扩展后再试';
    if (activeTabId != null) applyButton.disabled = false;
  }
}

applyButton.addEventListener('click', async () => {
  if (activeTabId == null) return;
  applyButton.disabled = true;
  statusText.textContent = modeOn ? '正在退出追剧模式…' : '正在开启追剧模式…';

  try {
    const connection = await connect(activeTabId);
    if (!connection?.hasPlayer) throw new Error('已连接抖音页，但暂未找到播放器');
    setModeState(connection.modeOn);

    let result;
    if (modeOn) {
      result = await chrome.tabs.sendMessage(activeTabId, { type: 'exit-mode-v2' });
    } else {
      const settings = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control.checked]));
      await chrome.storage.local.set(settings);
      result = await chrome.tabs.sendMessage(activeTabId, { type: 'apply-settings-v2', settings });
    }
    if (!result?.ok) throw new Error(result?.error || '找不到当前播放视频');
    setModeState(result.modeOn);
    if (!targetWasActive) await chrome.tabs.update(activeTabId, { active: true });
    window.close();
  } catch (error) {
    status.dataset.ready = 'false';
    statusText.textContent = error.message || '请刷新抖音页面后重试';
    applyButton.disabled = false;
  }
});

initialize().catch(() => {
  status.dataset.ready = 'false';
  statusText.textContent = '扩展初始化失败，请重新加载';
});
