const checkout = document.getElementById('checkout');

document.querySelectorAll('[data-buy]').forEach((btn) => {
  btn.addEventListener('click', () => checkout.showModal());
});

checkout.addEventListener('click', (event) => {
  if (event.target === checkout) checkout.close();
});
