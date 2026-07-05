export function initAboutModal() {
  const aboutBtn = document.getElementById('aboutBtn');
  const aboutDialog = document.getElementById('aboutDialog');
  const aboutContent = document.getElementById('aboutContent');

  if (!aboutBtn || !aboutDialog || !aboutContent) return;

  aboutBtn.addEventListener('click', () => {
    aboutContent.innerHTML = [
      'HR Glass PRO',
      'Version 1.0.0',
      'Powered by Alpha',
      'Mode: Web/Desktop'
    ].map(line => `<div>${line}</div>`).join('');
    aboutDialog.showModal();
  });
}
