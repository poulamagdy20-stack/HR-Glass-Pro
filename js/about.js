export function initAboutModal(){
  const btn = document.getElementById('aboutBtn');
  const dialog = document.getElementById('aboutDialog');
  const content = document.getElementById('aboutContent');

  if(!btn || !dialog || !content) return;

  btn.addEventListener('click', () => {
    content.innerHTML = `
      <div>HR Glass PRO</div>
      <div>Version 1.0.0</div>
      <div>Powered by Alpha</div>
      <div>Mode: Web/Desktop</div>
    `;
    dialog.showModal();
  });
}
