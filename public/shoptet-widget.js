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

  // The MioCoin icon sits next to this file, so it is resolved from the script's own
  // URL. That keeps it correct on the partner's domain (absolute onemil.cz URL) and
  // in tests (localhost) without a second setting to configure.
  var ICON_URL = script.src
    ? script.src.replace(/[^/]*$/, 'miocoin-icon.png')
    : 'https://onemil.cz/miocoin-icon.png';

  // ── styling ────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent =
    '.' + CLS + '{display:inline-flex;align-items:center;gap:6px;margin:8px 0;padding:6px 12px;' +
    'border-radius:999px;background:linear-gradient(135deg,#FF8A00,#FFB547);color:#0A0B0F;' +
    'font-weight:700;font-size:13px;line-height:1.3;}' +
    // Cart / checkout: a discreet standalone note, NOT a branded pill. It sits in a
    // stranger's checkout right above their CTA, so it stays on a transparent
    // background and never restyles or overlaps the shop's own buttons.
    '.' + CLS + '--cart{display:flex;align-items:center;justify-content:flex-start;' +
    'width:100%;box-sizing:border-box;margin:8px 0;padding:8px 0;border:0;border-radius:0;' +
    'background:none;background-image:none;color:#BD6400;font-weight:700;font-size:13px;' +
    'line-height:1.35;text-align:left;}' +
    '.' + CLS + '-ico{display:inline-block;width:17px;height:17px;margin-right:6px;' +
    'vertical-align:-4px;border-radius:50%;flex-shrink:0;}' +
    // Listing cards: a wide orange rule under the price, then the MioCoin icon and
    // the reward line. The rule carries the visual accent, which lets the text stay
    // dark enough to read (a full #FF8A00 text on white would fail contrast).
    // max-width keeps the rule inside a narrow mobile card.
    '.' + CLS_CARD + '{display:block;margin:6px 0 0;font-size:12.5px;line-height:1.35;' +
    'font-weight:700;color:#BD6400;}' +
    '.' + CLS_CARD + '::before{content:"";display:block;width:120px;max-width:100%;' +
    'height:3px;margin:0 0 5px;border-radius:2px;background:#FF8A00;}' +
    // Icon is the original MioCoin artwork, downscaled — see scripts/make-miocoin-icon.mjs.
    '.' + CLS_CARD + '-ico{display:inline-block;width:17px;height:17px;margin-right:5px;' +
    'vertical-align:-4px;border-radius:50%;flex-shrink:0;}';
  document.head.appendChild(style);

  // Anything that is, or lives inside, one of the shop's own buttons/links. The
  // widget must never end up in there — it would become part of their CTA.
  var CTA_SEL = 'button, a, [role="button"], .btn, .next-step-forward, .next-step-back';

  function isInsideCta(el) {
    return !!(el && el.closest && el.closest(CTA_SEL));
  }

  function render(target, text, isCart) {
    if (!target) return;
    var existing = target.parent
      ? target.parent.querySelector('.' + CLS)
      : target.querySelector('.' + CLS);

    if (!existing) {
      existing = document.createElement('div');
      existing.className = CLS + (isCart ? ' ' + CLS + '--cart' : '');

      if (isCart) {
        var ico = document.createElement('img');
        ico.className = CLS + '-ico';
        ico.src = ICON_URL;
        ico.alt = '';
        ico.setAttribute('aria-hidden', 'true');
        ico.width = 17;
        ico.height = 17;
        existing.appendChild(ico);
        existing.appendChild(document.createElement('span'));
      }

      if (target.parent) target.parent.insertBefore(existing, target.before);
      else target.appendChild(existing);

      // Safety net: if a template we have not seen still lands us inside a button
      // or link, back out rather than deface the shop's CTA.
      if (isInsideCta(existing.parentElement)) {
        existing.remove();
        return;
      }
    }

    var slot = isCart ? existing.querySelector('span') : null;
    (slot || existing).textContent = text;
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

  // Under the price block, at full card width.
  //
  // Measured on the real template: .prices is only ~125px because the price and the
  // buy button sit side by side, which forces "Získáte 11 MioCoinů" onto three lines
  // and clips the 120px rule. The [data-micro="offer"] wrapper around them is ~260px,
  // so the badge goes there — still directly under the price, but on one clean line.
  function cardTarget(card) {
    return card.querySelector('[data-micro="offer"]') ||
           card.querySelector('.p-bottom') ||
           card.querySelector('.prices') ||
           card.querySelector('.price-final');
  }

  function renderCard(card, coins) {
    var target = cardTarget(card);
    if (!target || coins <= 0) return;
    var el = target.querySelector('.' + CLS_CARD);
    if (!el) {
      el = document.createElement('span');
      el.className = CLS_CARD;

      // Decorative only — the sentence beside it already carries the meaning, so the
      // icon is hidden from assistive tech rather than read out as a second label.
      var ico = document.createElement('img');
      ico.className = CLS_CARD + '-ico';
      ico.src = ICON_URL;
      ico.alt = '';
      ico.setAttribute('aria-hidden', 'true');
      ico.setAttribute('loading', 'lazy');
      ico.width = 17;
      ico.height = 17;

      var txt = document.createElement('span');
      txt.className = CLS_CARD + '-txt';

      el.appendChild(ico);
      el.appendChild(txt);
      // Sit above the short description when the template has one, so the badge
      // stays visually attached to the price rather than drifting to the card
      // bottom. insertBefore(null) is a plain append, so both layouts work.
      target.insertBefore(el, target.querySelector('.p-desc'));
    }
    var textNode = el.querySelector('.' + CLS_CARD + '-txt') || el;
    textNode.textContent = 'Získáte ' + coins + ' ' + czPlural(coins);
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

  // Where the cart/checkout note goes.
  //
  // Verified on the real checkout (/objednavka/krok-1/):
  //   .cart-content
  //     ├── .order-summary  ... "Celkem k úhradě 50 Kč"
  //     └── .next-step      <- a.next-step-back + button.next-step-forward
  //
  // `.next-step-forward` is the "Pokračovat" control itself (an <a> in the basket,
  // a <button> at checkout). Targeting it appended our text INSIDE the shop's CTA.
  // We now insert as a sibling BEFORE the whole .next-step block: below the totals,
  // above the buttons, never part of them.
  //
  // Returns either {parent, before} for sibling insertion, or a plain element to
  // append to.
  function cartTarget() {
    var nextStep = document.querySelector('.next-step');
    if (nextStep && nextStep.parentElement && !isInsideCta(nextStep.parentElement)) {
      return { parent: nextStep.parentElement, before: nextStep };
    }

    // No .next-step wrapper: climb out of the CTA to a safe block and go above it.
    var cta = document.querySelector('.next-step-forward, #orderFormButton');
    if (cta) {
      var block = cta.parentElement;
      while (block && isInsideCta(block)) block = block.parentElement;
      if (block && block.parentElement) return { parent: block.parentElement, before: block };
    }

    // Basket page and generic templates.
    var summary = document.querySelector('.cart-summary') || document.querySelector('#cart-summary');
    if (summary && !isInsideCta(summary)) return summary;

    var content = document.querySelector('.cart-content');
    return content && !isInsideCta(content) ? content : null;
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

      render(cartTarget(), 'Získáte přibližně ' + res.coins + ' ' + czPlural(res.coins), true);
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
