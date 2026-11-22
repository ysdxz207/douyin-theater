const DEBUGGER_VERSION = '1.3';

async function sendFullscreenKey(tabId) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, DEBUGGER_VERSION);
    attached = true;
    const key = { key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72, nativeVirtualKeyCode: 72 };
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'char', text: 'h', unmodifiedText: 'h', ...key });
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || '无法发送 H 快捷键' };
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'douyin-fullscreen-key' || sender.tab?.id == null) return;
  sendFullscreenKey(sender.tab.id).then(sendResponse);
  return true;
});
