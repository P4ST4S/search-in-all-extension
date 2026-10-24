import { createController } from './controller.js';

const controller = createController(chrome);
chrome.action.onClicked.addListener((tab) => { void controller.activate(tab); });
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  controller.handle(message, sender).then(reply, () => reply({ ok: false, error: 'L’action a échoué. Réessayez.' }));
  return true;
});
chrome.tabs.onRemoved.addListener((id) => controller.forget(id));
chrome.tabs.onUpdated.addListener((id, change) => { if (change.url) controller.forget(id); });
