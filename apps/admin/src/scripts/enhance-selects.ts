import { enhanceAllSelects } from '../components/enhance-select';

enhanceAllSelects();

document.querySelectorAll<HTMLSelectElement>('select[data-auto-submit="1"]').forEach((sel) => {
  sel.addEventListener('change', () => sel.form?.requestSubmit());
});
