const dialog=document.querySelector('#preview-detail');
const examples={A:'가상 주문 PREVIEW-001 · 예시 고객 A\n상품: 19,000원 · 15쪽 PDF\n샘플 상태: 메일 발송 접수\n가상 문의: PDF를 다시 받을 수 있나요?',B:'가상 주문 PREVIEW-002 · 예시 고객 B\n상품: 19,000원 · 15쪽 PDF\n샘플 상태: 제작·발송 대기',C:'가상 주문 PREVIEW-003 · 예시 고객 C\n상품: 19,000원 · 15쪽 PDF\n샘플 상태: 전액 환불 완료 · 리포트 열람 종료'};
document.querySelectorAll('[data-preview-order]').forEach(button=>button.addEventListener('click',()=>{document.querySelector('#preview-detail-title').textContent='예시 고객 '+button.dataset.previewOrder+' · 주문 상세';document.querySelector('#preview-detail-content').textContent=examples[button.dataset.previewOrder];dialog.showModal();}));
document.querySelector('#close-preview').addEventListener('click',()=>dialog.close());
