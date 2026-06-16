document.getElementById('start-btn').onclick = async () => {
  const raw = document.getElementById('paths').value.trim();
  if (!raw) {
    alert('请输入至少一个类目路径');
    return;
  }

  // 每行一个路径，> 分隔层级
  const paths = raw.split('\n')
    .map(line => line.split('>').map(s => s.trim()).filter(Boolean))
    .filter(arr => arr.length > 0);

  if (paths.length === 0) {
    alert('请输入至少一个类目路径');
    return;
  }

  const filename = document.getElementById('filename').value.trim() || '飞瓜数据';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('bigdatavoice.com') && !tab.url.includes('dy.feigua.cn')) {
    alert('请先打开飞瓜数据概览页面');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['interceptor.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (_) {}

  const btn = document.getElementById('start-btn');
  btn.disabled = true;
  btn.textContent = '遍历中...';

  await chrome.tabs.sendMessage(tab.id, {
    type: 'startTraversal',
    paths: paths,
    filename: filename
  });
  window.close();
};
