import { boot } from './app.js';

boot().catch(err => {
  console.error(err);
  const app = document.getElementById('app');
  if (app) app.textContent = '启动失败 / Failed to start: ' + err.message;
});
