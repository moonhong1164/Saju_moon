const birth = document.querySelector('#birth');
birth.max = new Date().toLocaleDateString('en-CA');
const dialog = document.querySelector('#result');
let topic = '종합 사주';
document.querySelectorAll('[data-topic]').forEach(card => card.addEventListener('click', () => { topic = card.dataset.topic; }));
document.querySelector('#birth-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get('name')).trim() || '방문자';
  document.querySelector('#result-text').textContent = `${name}님이 선택한 이야기: ${topic}\n생년월일: ${form.get('birth')} (${form.get('calendar')})\n태어난 시간: ${form.get('time') || '모름'}`;
  dialog.showModal();
});
document.querySelectorAll('.close, .close-result').forEach(button => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
