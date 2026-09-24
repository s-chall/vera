const modal = document.querySelector('#composerModal');
const fundModal = document.querySelector('#fundModal');
const readerModal = document.querySelector('#readerModal');
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

function openFundModal() {
  fundModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeFundModal() {
  fundModal.hidden = true;
  document.body.style.overflow = '';
}

function openReader(story) {
  document.querySelector('#readerTitle').textContent = story.querySelector('h2').textContent;
  document.querySelector('#readerDek').textContent = story.querySelector('.story-copy > p').textContent;
  document.querySelector('#readerAuthor').textContent = story.querySelector('.author-name').textContent;
  document.querySelector('#readerLength').textContent = story.querySelector('.story-meta span').textContent;
  readerModal.hidden = false;
  readerModal.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closeReader() {
  readerModal.hidden = true;
  document.body.style.overflow = '';
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2200);
}

document.querySelector('#openComposerNav').addEventListener('click', openComposer);
document.querySelector('#closeComposer').addEventListener('click', closeComposer);
document.querySelector('#openFund').addEventListener('click', openFundModal);
document.querySelector('#closeFund').addEventListener('click', closeFundModal);
document.querySelector('#closeReader').addEventListener('click', closeReader);

modal.addEventListener('click', (event) => {
  if (event.target === modal) closeComposer();
});

fundModal.addEventListener('click', (event) => {
  if (event.target === fundModal) closeFundModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeComposer();
  if (event.key === 'Escape' && !fundModal.hidden) closeFundModal();
  if (event.key === 'Escape' && !readerModal.hidden) closeReader();
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

document.querySelectorAll('[data-screen]').forEach((item) => {
  item.addEventListener('click', () => {
    const screen = item.dataset.screen;
    document.querySelectorAll('.screen').forEach((panel) => {
      panel.hidden = panel.id !== `${screen}Screen`;
      panel.classList.toggle('active', panel.id === `${screen}Screen`);
    });
    document.querySelectorAll('[data-screen]').forEach((navItem) => {
      const selected = navItem === item;
      navItem.classList.toggle('active', selected);
      if (selected) navItem.setAttribute('aria-current', 'page');
      else navItem.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

document.querySelectorAll('.quick-amounts button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector('#fundAmount').value = button.dataset.amount;
    document.querySelectorAll('.quick-amounts button').forEach((item) => item.classList.toggle('selected', item === button));
  });
});

document.querySelector('#fundAmount').addEventListener('input', () => {
  document.querySelectorAll('.quick-amounts button').forEach((item) => {
    item.classList.toggle('selected', item.dataset.amount === document.querySelector('#fundAmount').value);
  });
});

document.querySelector('#connectWallet').addEventListener('click', () => {
  showToast('Bitcoin wallet connection will open here');
});

document.querySelector('#openPoolDetails').addEventListener('click', () => {
  showToast('Pool details will open here');
});

document.querySelector('#toggleBalance').addEventListener('click', (event) => {
  const wallet = document.querySelector('.wallet-card');
  const balance = document.querySelector('#btcBalance');
  const isHidden = wallet.classList.toggle('balance-hidden');
  balance.textContent = isHidden ? '••••••' : '0.1842';
  event.currentTarget.setAttribute('aria-pressed', String(isHidden));
  event.currentTarget.setAttribute('aria-label', isHidden ? 'Show wallet balance' : 'Hide wallet balance');
});

document.querySelector('#receivePool').addEventListener('click', () => {
  showToast('Pool receiving address will be added next');
});

document.querySelector('#payoutFilter').addEventListener('click', () => {
  showToast('Payout filters will open here');
});

document.querySelector('#walletActivity').addEventListener('click', () => {
  showToast('Wallet activity will open here');
});

document.querySelector('#profileSettings').addEventListener('click', () => {
  showToast('Profile settings will open here');
});

document.querySelector('.menu-button').addEventListener('click', () => showToast('Menu will open here'));
document.querySelector('.inbox-button').addEventListener('click', () => showToast('You’re all caught up'));
document.querySelector('#feedOptions').addEventListener('click', () => showToast('Feed preferences will open here'));

document.querySelector('.brand').addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelector('[data-screen="articles"]').click();
});

document.querySelectorAll('.save-story').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const saved = button.classList.toggle('saved');
    button.setAttribute('aria-label', saved ? 'Remove saved article' : 'Save article');
    showToast(saved ? 'Saved to your reading list' : 'Removed from saved');
  });
});

document.querySelector('#readerSave').addEventListener('click', (event) => {
  const saved = event.currentTarget.classList.toggle('saved');
  showToast(saved ? 'Saved to your reading list' : 'Removed from saved');
});

document.querySelectorAll('.profile-post').forEach((post) => {
  post.addEventListener('click', () => showToast('Your published article will open here'));
});

document.querySelectorAll('.story').forEach((story) => {
  story.addEventListener('click', () => openReader(story));
});
