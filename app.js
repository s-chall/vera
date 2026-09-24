const modal = document.querySelector('#composerModal');
const headlineInput = document.querySelector('#headlineInput');
const toast = document.querySelector('#toast');
let toastTimer;

function openComposer() {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => headlineInput.focus(), 120);
}

function closeComposer() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
}

document.querySelector('#openComposer').addEventListener('click', openComposer);
document.querySelector('#openComposerIcon').addEventListener('click', openComposer);
document.querySelector('#closeComposer').addEventListener('click', closeComposer);

modal.addEventListener('click', (event) => {
  if (event.target === modal) closeComposer();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeComposer();
});

document.querySelector('#publishArticle').addEventListener('click', () => {
  const headline = headlineInput.value.trim();
  if (!headline) {
    headlineInput.focus();
    showToast('Add a headline before publishing');
    return;
  }
  closeComposer();
  showToast('Article published under Quiet Current');
});

document.querySelectorAll('.feed-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.feed-tab').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    const stories = [...document.querySelectorAll('.story')];
    if (tab.dataset.filter === 'latest') {
      stories.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order));
    } else {
      stories.sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order)).reverse();
    }
    stories.forEach((story) => document.querySelector('#feed').appendChild(story));
  });
});

document.querySelectorAll('.coming-soon').forEach((item) => {
  item.addEventListener('click', () => showToast(`${item.dataset.page} is the next screen`));
});

document.querySelectorAll('.story').forEach((story) => {
  story.addEventListener('click', () => showToast('Article reader will open here'));
});
