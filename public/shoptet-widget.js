/*!
 * OneMil MioCoin widget for Shoptet.
 *
 * The partner pastes ONE snippet into Shoptet → Vzhled a obsah → Editor HTML kódu:
 *
 *   <script src="https://onemil.cz/shoptet-widget.js"
 *           data-onemil-partner="PARTNER-UUID" defer></script>
 *
 * CRITICAL INVARIANT: this file contains NO reward maths. Every number it renders
 * comes from the OneMil reward engine (compute_partner_reward) via the public
 * preview endpoint — the same engine that later issues the MioCoins. If you are
 * tempted to compute a total here, don't: the cart figure and the real payout would
 * drift apart the moment the rules change.
 *
 * It carries no secret: no API key, no Shoptet export URL, no Vault value. The
 * partner id is a public identifier, and the endpoint only ever returns the reward
 * for a basket the customer is already looking at.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var partnerId = script.getAttribute('data-onemil-partner');
  if (!partnerId) return;

  var API =
    script.getAttribute('data-onemil-api') ||
    'https://dxmowysntemfqfnanxua.supabase.co/functions/v1/partner-reward-preview';

  var CLS = 'onemil-mc-widget';

  // ── styling ────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent =
    '.' + CLS + '{display:inline-flex;align-items:center;gap:6px;margin:8px 0;padding:6px 12px;' +
    'border-radius:999px;background:linear-gradient(135deg,#FF8A00,#FFB547);color:#0A0B0F;' +
    'font-weight:700;font-size:13px;line-height:1.3;}' +
    '.' + CLS + '--cart{display:flex;width:100%;justify-content:center;border-radius:10px;' +
    'padding:10px 14px;font-size:14px;}';
  document.head.appendChild(style);

  function render(target, text, isCart) {
    if (!target) return;
    var existing = target.querySelector('.' + CLS);
    if (!existing) {
      existing = document.createElement('div');
      existing.className = CLS + (isCart ? ' ' + CLS + '--cart' : '');
      target.appendChild(existing);
    }
    existing.textContent = text;
  }

  function removeAll() {
    var nodes = document.querySelectorAll('.' + CLS);
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }

  function preview(payload) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function czPlural(n) {
    // 1 MioCoin / 2–4 MioCoiny / 5+ MioCoinů
    if (n === 1) return 'MioCoin';
    if (n >= 2 && n <= 4) return 'MioCoiny';
    return 'MioCoinů';
  }

  // ── reading the storefront ─────────────────────────────────────────────────
  // Shoptet exposes order/product data through the dataLayer on most templates.
  // Selector fallbacks cover templates that do not.
  function currentProductCode() {
    try {
      var dl = window.dataLayer || [];
      for (var i = dl.length - 1; i >= 0; i--) {
        var e = dl[i];
        if (e && e.ecommerce && e.ecommerce.detail && e.ecommerce.detail.products) {
          var p = e.ecommerce.detail.products[0];
          if (p && (p.id || p.code)) return String(p.id || p.code);
        }
      }
    } catch (_) { /* fall through to DOM */ }

    var el = document.querySelector('[data-micro-product-code], [data-product-code], .p-code .value');
    if (!el) return null;
    return (el.getAttribute('data-micro-product-code') ||
            el.getAttribute('data-product-code') ||
            el.textContent || '').trim() || null;
  }

  // Parses a Czech price string ("1 234,50 Kč") or a microdata attribute.
  function parsePrice(raw) {
    var n = parseFloat(
      String(raw == null ? '' : raw).replace(/\s/g, '').replace(/ /g, '').replace(/[^\d,.-]/g, '').replace(',', '.'),
    );
    return isFinite(n) && n > 0 ? n : 0;
  }

  // Current price of the product being viewed, for the product detail badge.
  function currentProductPrice() {
    try {
      var dl = window.dataLayer || [];
      for (var i = dl.length - 1; i >= 0; i--) {
        var e = dl[i];
        if (e && e.ecommerce && e.ecommerce.detail && e.ecommerce.detail.products) {
          var p = e.ecommerce.detail.products[0];
          if (p && p.price) {
            var dlPrice = parsePrice(p.price);
            if (dlPrice > 0) return dlPrice;
          }
        }
      }
    } catch (_) { /* fall through to DOM */ }

    var el = document.querySelector('[data-micro-price], .price-final-holder, .price-final, .p-final-price');
    if (!el) return 0;
    return parsePrice(el.getAttribute('data-micro-price') || el.textContent);
  }

  function cartItems() {
    var rows = document.querySelectorAll('[data-micro-product-id], .cart-item, tr[data-micro]');
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var code =
        row.getAttribute('data-micro-product-code') ||
        row.getAttribute('data-product-code') ||
        (row.querySelector('[data-micro-product-code]') || {}).textContent;
      if (!code) continue;

      var qtyEl = row.querySelector('input[name*="quantity"], .quantity input, [data-testid="quantity"]');
      var qty = qtyEl ? parseFloat(qtyEl.value || qtyEl.getAttribute('value') || '1') : 1;

      var priceEl = row.querySelector('[data-micro-price], .p-price, .price');
      var price = priceEl ? parsePrice(priceEl.getAttribute('data-micro-price') || priceEl.textContent) : 0;

      items.push({
        code: String(code).trim(),
        quantity: qty > 0 ? qty : 1,
        unit_price_czk: price,
      });
    }
    return items;
  }

  // Current goods value of the basket: sum(unit_price * quantity).
  //
  // This is NOT a reward calculation — it is the order value the engine needs as
  // input. compute_partner_reward requires order_total_czk in whole_shop mode (the
  // default for every partner), and without it the endpoint answers
  // `invalid_order_total_czk` and the widget renders nothing. No MioCoin amount is
  // ever derived here; the engine remains the only thing that turns money into MC.
  function itemsValue(items) {
    var total = 0;
    for (var i = 0; i < items.length; i++) {
      total += items[i].unit_price_czk * items[i].quantity;
    }
    return total;
  }

  // ── product page badge (partner can switch this off) ───────────────────────
  function updateProductBadge() {
    var code = currentProductCode();
    if (!code) return;

    // A single unit of this product. order_total_czk is that unit's price, so the
    // badge works in whole_shop mode too — not only when a SKU rule exists.
    var price = currentProductPrice();
    var items = [{ code: code, quantity: 1, unit_price_czk: price }];

    preview({
      partner_id: partnerId,
      items: items,
      order_total_czk: itemsValue(items),
    }).then(function (res) {
      if (!res || res.status !== 'ok' || !res.enabled) return;
      if (res.product_badge_enabled === false) return;

      // whole_shop returns an empty per-item breakdown, so fall back to the order
      // total; selected_products returns the SKU's own figure. Either way the
      // number comes from the engine.
      var coins = (res.items && res.items[0] && res.items[0].coins) || res.coins || 0;
      if (coins <= 0) return;

      var target =
        document.querySelector('.p-detail-inner-header') ||
        document.querySelector('.p-info-wrapper') ||
        document.querySelector('.product-top');
      render(target, 'Za tento produkt získáte ' + coins + ' ' + czPlural(coins), false);
    });
  }

  // ── cart summary (always shown while the connection is active) ─────────────
  function updateCart() {
    var items = cartItems();
    if (items.length === 0) { removeAll(); return; }

    // order_total_czk is required by the engine in whole_shop mode (the default),
    // and is harmlessly ignored when per-product rules drive the result.
    preview({
      partner_id: partnerId,
      items: items,
      order_total_czk: itemsValue(items),
    }).then(function (res) {
      if (!res || res.status !== 'ok' || !res.enabled || !res.coins) { removeAll(); return; }

      var target =
        document.querySelector('.cart-summary') ||
        document.querySelector('#cart-summary') ||
        document.querySelector('.next-step-forward') ||
        document.querySelector('.cart-content');
      render(target, 'Za tento nákup získáte přibližně ' + res.coins + ' ' + czPlural(res.coins), true);
    });
  }

  // Debounced so a quantity spinner does not fire a request per keystroke.
  var timer = null;
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      updateProductBadge();
      updateCart();
    }, 250);
  }

  refresh();

  // Recalculate whenever the basket changes: quantity edits, add/remove, and the
  // AJAX re-renders Shoptet does without a page reload.
  document.addEventListener('change', function (e) {
    if (e.target && e.target.closest && e.target.closest('form, .cart-item, [data-micro-product-id]')) refresh();
  });
  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.remove-item, .btn-cart, [data-testid*="cart"]')) refresh();
  });

  if (window.MutationObserver) {
    var observed =
      document.querySelector('.cart-content') ||
      document.querySelector('#content-wrapper') ||
      document.body;
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        // Ignore our own badge insertions, otherwise the observer loops.
        var t = muts[i].target;
        if (t && t.classList && t.classList.contains(CLS)) continue;
        refresh();
        return;
      }
    }).observe(observed, { childList: true, subtree: true });
  }
})();
