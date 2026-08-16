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

  // PRODUCTION endpoint. This file is served to real storefronts, so the default
  // must never point at staging — a partner pasting the documented snippet would
  // otherwise be quoted from staging data (wrong rate, or no partner row at all).
  // data-onemil-api stays available purely for testing.
  var API =
    script.getAttribute('data-onemil-api') ||
    'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/partner-reward-preview';

  var CLS = 'onemil-mc-widget';
  // Product-listing cards get their own class: the cart clears its own badge when
  // the basket empties, and must never wipe the badges on a category page.
  var CLS_CARD = 'onemil-mc-card';

  // ── styling ────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent =
    '.' + CLS + '{display:inline-flex;align-items:center;gap:6px;margin:8px 0;padding:6px 12px;' +
    'border-radius:999px;background:linear-gradient(135deg,#FF8A00,#FFB547);color:#0A0B0F;' +
    'font-weight:700;font-size:13px;line-height:1.3;}' +
    '.' + CLS + '--cart{display:flex;width:100%;justify-content:center;border-radius:10px;' +
    'padding:10px 14px;font-size:14px;}' +
    // Listing cards: a quiet one-liner under the price, not a loud pill.
    '.' + CLS_CARD + '{display:block;margin:4px 0 0;font-size:12px;line-height:1.35;' +
    'font-weight:600;color:#B35F00;white-space:nowrap;}';
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

  // Only clears the cart/detail badge. Listing card badges are managed separately.
  function removeAll() {
    var nodes = document.querySelectorAll('.' + CLS);
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }

  // Rendering the badge mutates the page, which wakes the MutationObserver, which
  // would refresh again forever. Repeating an identical request is always pointless,
  // so the last payload/response pair is reused instead of re-querying.
  var lastPayload = {};
  var lastResult = {};

  function preview(kind, payload) {
    var key = JSON.stringify(payload);
    if (lastPayload[kind] === key && lastResult[kind] !== undefined) {
      return Promise.resolve(lastResult[kind]);
    }
    lastPayload[kind] = key;

    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; })
      .then(function (res) { lastResult[kind] = res; return res; });
  }

  function czPlural(n) {
    // 1 MioCoin / 2–4 MioCoiny / 5+ MioCoinů
    if (n === 1) return 'MioCoin';
    if (n >= 2 && n <= 4) return 'MioCoiny';
    return 'MioCoinů';
  }

  // ── reading the storefront ─────────────────────────────────────────────────
  //
  // Verified against a real Shoptet storefront (809915.myshoptet.com). Shoptet's
  // own object is `window.dataLayer[i].shoptet` and it is authoritative and
  // updated IN PLACE as the basket changes:
  //
  //   shoptet.pageType            "productDetail" | "cart" | ...
  //   shoptet.product.codes[]     [{code:"49396/ZEL"}, ...]   (several when variants)
  //   shoptet.product.priceWithVat 50
  //   shoptet.cart[]              [{code, quantity, priceWithVat, priceWithoutDiscount, name}]
  //
  // Note the cart carries BOTH priceWithVat (after discount) and
  // priceWithoutDiscount — we must use priceWithVat, matching the confirmed rule
  // that ratio rewards are based on the real after-discount price.
  //
  // The DOM fallbacks below are the selectors this template really uses
  // (data-micro-sku, input[name="amount"]) — NOT data-micro-product-code or
  // input[name*="quantity"], which do not exist here.
  function shoptetData() {
    try {
      var dl = window.dataLayer || [];
      for (var i = dl.length - 1; i >= 0; i--) {
        if (dl[i] && dl[i].shoptet) return dl[i].shoptet;
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  function currentProductCode() {
    // The visible SKU reflects the selected variant, so it wins over the raw
    // codes[] list when the product has several variants.
    var metaSku = document.querySelector('meta[itemprop="sku"], [data-micro-sku]');
    if (metaSku) {
      var fromMeta = (metaSku.getAttribute('content') || metaSku.getAttribute('data-micro-sku') || '').trim();
      if (fromMeta) return fromMeta;
    }

    var s = shoptetData();
    if (s && s.product && s.product.codes && s.product.codes.length) {
      var first = s.product.codes[0];
      var code = typeof first === 'string' ? first : (first && first.code);
      if (code) return String(code).trim();
    }

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
    var s = shoptetData();
    if (s && s.product && s.product.priceWithVat) {
      var dlPrice = parsePrice(s.product.priceWithVat);
      if (dlPrice > 0) return dlPrice;
    }

    // schema.org offer price is present on the detail template and tracks the
    // selected variant.
    var metaPrice = document.querySelector('meta[itemprop="price"]');
    if (metaPrice) {
      var fromMeta = parsePrice(metaPrice.getAttribute('content'));
      if (fromMeta > 0) return fromMeta;
    }

    var el = document.querySelector('[data-micro-price], .price-final-holder, .price-final, .p-final-price');
    if (!el) return 0;
    return parsePrice(el.getAttribute('data-micro-price') || el.textContent);
  }

  function cartItems() {
    // Preferred: Shoptet's own cart array. It is updated in place on quantity
    // changes and already carries the after-discount unit price.
    var s = shoptetData();
    if (s && s.cart && s.cart.length) {
      var out = [];
      for (var c = 0; c < s.cart.length; c++) {
        var line = s.cart[c];
        if (!line) continue;
        var lq = parseFloat(line.quantity);
        out.push({
          code: String(line.code == null ? '' : line.code).trim(),
          quantity: lq > 0 ? lq : 1,
          unit_price_czk: parsePrice(line.priceWithVat),
        });
      }
      if (out.length) return out;
    }

    // DOM fallback, using this template's real attributes. Scoped to genuine cart
    // rows: a listing card is <div data-micro="product"> and also carries
    // data-micro-product-id / data-micro-sku, so a loose selector here would make a
    // category page look like a basket.
    var rows = document.querySelectorAll('tr[data-micro="cartItem"], [data-micro="cartItem"], .cart-item');
    var items = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-micro') === 'product') continue;
      var code =
        row.getAttribute('data-micro-sku') ||
        row.getAttribute('data-micro-product-code') ||
        row.getAttribute('data-product-code') ||
        ((row.querySelector('[data-micro-sku]') || {}).getAttribute
          ? row.querySelector('[data-micro-sku]').getAttribute('data-micro-sku')
          : '');

      var qtyEl = row.querySelector('input[name="amount"], input.amount, input[name*="quantity"], .quantity input');
      var qty = qtyEl ? parseFloat(qtyEl.value || qtyEl.getAttribute('value') || '1') : 1;

      var priceEl = row.querySelector('[data-micro-price], .p-price, .price');
      var price = priceEl ? parsePrice(priceEl.getAttribute('data-micro-price') || priceEl.textContent) : 0;

      // A line with no readable code is still kept: in whole_shop (the default)
      // the reward comes from order_total_czk, so dropping the line would
      // understate the basket. The engine ignores code-less entries when
      // per-product rules apply.
      items.push({
        code: String(code == null ? '' : code).trim(),
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
    // Only on a product detail page. The cart rows also carry data-micro-sku, so
    // without this guard the badge would appear on the basket — and when no
    // dataLayer is present it would read a cart SKU with no price at all.
    var s = shoptetData();
    if (s && s.pageType) {
      if (s.pageType !== 'productDetail') return;
    } else if (document.querySelector('tr[data-micro="cartItem"], .cart-content')) {
      // No pageType to trust: a visible cart table means this is not a detail page.
      return;
    }

    var code = currentProductCode();
    if (!code) return;

    // A single unit of this product. order_total_czk is that unit's price, so the
    // badge works in whole_shop mode too — not only when a SKU rule exists.
    var price = currentProductPrice();
    var items = [{ code: code, quantity: 1, unit_price_czk: price }];

    preview('product', {
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

  // ── product listing cards ──────────────────────────────────────────────────
  //
  // Verified card structure on the real storefront (category page):
  //
  //   <div class="p" data-micro="product" data-micro-product-id="39"
  //        data-testid="productItem">
  //     ...
  //     <div data-micro="offer" data-micro-price="50.00">      <- clean numeric price
  //       <div class="prices">
  //         <div class="price price-final">50 Kč</div>          <- badge goes under this
  //       </div>
  //     </div>
  //     <span class="p-code">Kód: <span data-micro="sku">49396/FIA</span></span>
  //   </div>
  //
  // The category dataLayer has no per-product array, so the cards themselves are
  // the source — and they carry both a clean price attribute and the SKU.

  // Cache keyed by code|price. Survives AJAX re-renders, so filtering or paging
  // back to a product never re-asks. Value: coins (number) or null when unknown.
  var cardCoins = {};
  var cardInFlight = {};
  var badgesDisabled = false;
  var cardQueue = [];
  var cardActive = 0;
  var CARD_CONCURRENCY = 4;

  function listingCards() {
    return document.querySelectorAll('.p[data-micro="product"], [data-testid="productItem"]');
  }

  function cardData(card) {
    var skuEl = card.querySelector('[data-micro="sku"]');
    var code = skuEl
      ? (skuEl.textContent || '').trim()
      : (card.getAttribute('data-micro-sku') || '').trim();

    var priceEl = card.querySelector('[data-micro-price]');
    var price = priceEl
      ? parsePrice(priceEl.getAttribute('data-micro-price'))
      : parsePrice((card.querySelector('.price-final') || {}).textContent);

    return { code: code, price: price };
  }

  // Under the price, inside the card.
  function cardTarget(card) {
    return card.querySelector('.prices') ||
           card.querySelector('.price-final') ||
           card.querySelector('.p-bottom');
  }

  function renderCard(card, coins) {
    var target = cardTarget(card);
    if (!target || coins <= 0) return;
    var el = target.querySelector('.' + CLS_CARD);
    if (!el) {
      el = document.createElement('span');
      el.className = CLS_CARD;
      target.appendChild(el);
    }
    el.textContent = 'Získáte ' + coins + ' ' + czPlural(coins);
  }

  function pumpCardQueue() {
    while (cardActive < CARD_CONCURRENCY && cardQueue.length) {
      (function (job) {
        cardActive++;
        preview('card:' + job.key, {
          partner_id: partnerId,
          items: [{ code: job.code, quantity: 1, unit_price_czk: job.price }],
          order_total_czk: job.price,
        }).then(function (res) {
          cardActive--;
          delete cardInFlight[job.key];

          if (res && res.status === 'ok' && res.product_badge_enabled === false) {
            // Partner switched product badges off — stop asking for the rest.
            badgesDisabled = true;
            cardQueue.length = 0;
            var stale = document.querySelectorAll('.' + CLS_CARD);
            for (var i = 0; i < stale.length; i++) stale[i].remove();
            return;
          }

          if (res && res.status === 'ok' && res.enabled) {
            var coins = (res.items && res.items[0] && res.items[0].coins) || res.coins || 0;
            cardCoins[job.key] = coins;
            // Re-resolve the card: an AJAX re-render may have replaced the node.
            paintKnownCards();
          } else {
            cardCoins[job.key] = 0;
          }
          pumpCardQueue();
        });
      })(cardQueue.shift());
    }
  }

  // Paints every currently visible card whose value is already known.
  function paintKnownCards() {
    if (badgesDisabled) return;
    var cards = listingCards();
    for (var i = 0; i < cards.length; i++) {
      var d = cardData(cards[i]);
      if (!d.code || d.price <= 0) continue;
      var key = d.code + '|' + d.price;
      if (cardCoins[key] !== undefined) renderCard(cards[i], cardCoins[key]);
    }
  }

  function queueCard(card) {
    if (badgesDisabled) return;
    var d = cardData(card);
    if (!d.code || d.price <= 0) return;

    var key = d.code + '|' + d.price;
    if (cardCoins[key] !== undefined) { renderCard(card, cardCoins[key]); return; }
    if (cardInFlight[key]) return;

    cardInFlight[key] = true;
    cardQueue.push({ key: key, code: d.code, price: d.price });
    pumpCardQueue();
  }

  // Only ask for cards the shopper can actually see; the rest are requested as they
  // scroll in. Keeps a 40-product category from firing 40 requests at once.
  var cardObserver = window.IntersectionObserver
    ? new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            queueCard(entries[i].target);
            cardObserver.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: '200px' })
    : null;

  function updateListingCards() {
    if (badgesDisabled) return;
    var cards = listingCards();
    for (var i = 0; i < cards.length; i++) {
      if (cardObserver) cardObserver.observe(cards[i]);
      else queueCard(cards[i]);
    }
    paintKnownCards();
  }

  // ── cart summary (always shown while the connection is active) ─────────────
  function updateCart() {
    var allLines = cartItems();
    if (allLines.length === 0) { removeAll(); return; }

    // The basket value covers EVERY line, including any whose code could not be
    // read, so the global whole_shop calculation is never understated. Only coded
    // lines are sent as items[] — they are the ones per-product rules can match.
    var total = itemsValue(allLines);
    var coded = [];
    for (var i = 0; i < allLines.length; i++) {
      if (allLines[i].code) coded.push(allLines[i]);
    }

    // order_total_czk is required by the engine in whole_shop mode (the default),
    // and is harmlessly ignored when per-product rules drive the result.
    preview('cart', {
      partner_id: partnerId,
      items: coded,
      order_total_czk: total,
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
      updateListingCards();
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
    // Ignore anything we inserted ourselves, otherwise painting a badge wakes the
    // observer, which repaints, which wakes it again.
    var isOurs = function (n) {
      return !!(n && n.classList && (n.classList.contains(CLS) || n.classList.contains(CLS_CARD)));
    };
    var onlyOurNodes = function (list) {
      if (!list || !list.length) return false;
      for (var j = 0; j < list.length; j++) if (!isOurs(list[j])) return false;
      return true;
    };

    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (isOurs(m.target)) continue;
        if (onlyOurNodes(m.addedNodes) || onlyOurNodes(m.removedNodes)) continue;
        refresh();
        return;
      }
    }).observe(observed, { childList: true, subtree: true });
  }
})();
