// iconic-fbt-api.js

(function () {
  if (window.__iconicFbtStorefrontInit) return;
  window.__iconicFbtStorefrontInit = true;

  const IconicFbtApi = {
    // App URL comes from the theme block only (`data-fbt-api-base` / IconicFbtSettings.apiBase).
    resolveApiBase: function (container) {
      if (container && container.dataset && container.dataset.fbtApiBase) {
        const fromEl = String(container.dataset.fbtApiBase).trim().replace(/\/$/, '');
        if (fromEl) return fromEl;
      }
      const settings = window.IconicFbtSettings || {};
      const fromSettings = settings.apiBase && String(settings.apiBase).trim();
      if (fromSettings) return fromSettings.replace(/\/$/, '');
      return '';
    },

    fetchRecommendations: async function (shopDomain, productId, container) {
      if (!shopDomain || !productId) {
        console.error('Iconic FBT: shopDomain and productId are required.');
        return null;
      }

      const apiBase = this.resolveApiBase(container);
      if (!apiBase) {
        console.error('Iconic FBT: apiBase is required. Set iconic_fbt_api_base in the FBT block Liquid.');
        return null;
      }

      const url =
        apiBase +
        '/api/recommendation?shop=' +
        encodeURIComponent(shopDomain) +
        '&productId=' +
        encodeURIComponent(productId);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }

        return await response.json();
      } catch (error) {
        console.error('Iconic FBT API Error:', error);
        return null;
      }
    },
  };

  const CART_ADD_URL = (window.routes && window.routes.cart_add_url) || '/cart/add.js';
  const CART_URL = (window.routes && window.routes.cart_url) || '/cart';
  const DEFAULT_ERROR_MESSAGE = 'Sorry — something went wrong adding items to cart.';
  /** Only on large viewports: allow "all fit" mode that hides arrows (never on phones / small laptops). */
  const FBT_SLIDER_DESKTOP_COUNT_MEDIA = '(min-width: 1200px)';

  function formatMoney(cents, currencySymbol) {
    if (currencySymbol) return currencySymbol + (cents / 100).toFixed(2);
    return (cents / 100).toFixed(2);
  }

  function parseMoneyCents(value) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function getFbtSetting(container, key, fallback) {
    if (container && container.dataset && container.dataset[key] !== undefined) {
      return container.dataset[key];
    }
    const block = container && container.closest ? container.closest('.iconic-block-fbt') : null;
    if (block && block.dataset && block.dataset[key] !== undefined) {
      return block.dataset[key];
    }
    return fallback;
  }

  function getBundleListEl(container) {
    return container.querySelector('.iconic-fbt-list');
  }

  function getBundleRows(container) {
    const list = getBundleListEl(container);
    return list ? Array.from(list.querySelectorAll('.iconic-fbt-row')) : Array.from(container.querySelectorAll('.iconic-fbt-row'));
  }

  function getBundleRowByIndex(container, idx) {
    const list = getBundleListEl(container);
    const root = list || container;
    return root.querySelector(`.iconic-fbt-row[data-index="${idx}"]`);
  }

  /** Always read the real checkbox input (avoids stale/wrong nodes if markup varies). */
  function getRowCheckbox(row) {
    if (!row) return null;
    return row.querySelector('input[type="checkbox"][data-fbt-checkbox]');
  }

  function getVariantFromRow(row) {
    const select = row.querySelector('[data-fbt-variant-select]');
    if (select) {
      let opt = select.options[select.selectedIndex] || select.options[0];
      if (opt && opt.value) {
        return {
          id: String(opt.value),
          price: parseMoneyCents(opt.dataset.price || '0'),
          compareAtPrice: parseMoneyCents(opt.dataset.compareAtPrice || '0'),
          available: opt.dataset.available !== 'false'
        };
      }
    }
    const hidden = row.querySelector('[data-fbt-variant-id]');
    if (hidden && hidden.value) {
      return {
        id: String(hidden.value),
        price: parseMoneyCents(hidden.dataset.price || '0'),
        compareAtPrice: parseMoneyCents(hidden.dataset.compareAtPrice || '0'),
        available: hidden.dataset.available !== 'false'
      };
    }
    if (row.dataset && row.dataset.fbtVariantId) {
      return {
        id: String(row.dataset.fbtVariantId),
        price: parseMoneyCents(row.dataset.price || '0'),
        compareAtPrice: parseMoneyCents(row.dataset.compareAtPrice || '0'),
        available: row.dataset.available !== 'false'
      };
    }
    return null;
  }

  function setStatus(container, message, type) {
    const status = container.querySelector('[data-fbt-status]');
    if (!status) return;
    const str = (message || '').trim();
    status.textContent = str;
    status.dataset.type = str ? (type || '') : '';
    if (!str) {
      status.setAttribute('hidden', '');
    } else {
      status.removeAttribute('hidden');
    }
  }

  function setBusy(container, isBusy) {
    const btn = container.querySelector('[data-fbt-add-selected]');
    if (!btn) return;
    btn.classList.toggle('is-loading', !!isBusy);
    btn.disabled = !!isBusy || btn.disabled;
    btn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }

  function parseDiscountConfig(container) {
    if (container._iconicFbtDiscountConfig !== undefined) return container._iconicFbtDiscountConfig;

    const script = container.querySelector('[data-fbt-discount-config]');
    if (!script) {
      container._iconicFbtDiscountConfig = null;
      return null;
    }

    try {
      let config = JSON.parse(script.textContent || 'null');
      if (typeof config === 'string' && config.trim()) {
        config = JSON.parse(config);
      }
      if (!config || typeof config !== 'object' || config.globalDiscountEnabled !== true) {
        container._iconicFbtDiscountConfig = null;
        return null;
      }
      container._iconicFbtDiscountConfig = config;
      return config;
    } catch (error) {
      console.error('Iconic FBT: invalid discount config JSON', error);
      container._iconicFbtDiscountConfig = null;
      return null;
    }
  }

  function moneyValueToCents(value) {
    const number = parseFloat(value || 0);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.round(number * 100);
  }

  function getRowIndex(row) {
    return parseInt(row.getAttribute('data-index') || '0', 10) || 0;
  }

  function getSelectedBundleRows(container) {
    return getBundleRows(container).map(row => {
      const checkbox = getRowCheckbox(row);
      const variant = getVariantFromRow(row);
      return {
        row,
        checkbox,
        variant,
        index: getRowIndex(row),
        selected: !!(checkbox && checkbox.checked && variant && variant.available)
      };
    });
  }

  function allocateFixedDiscount(rows, discountAmount) {
    const allocations = new Map();
    const eligibleRows = rows.filter(item => item.variant && item.variant.price > 0);
    const eligibleTotal = eligibleRows.reduce((sum, item) => sum + item.variant.price, 0);
    const cappedDiscount = Math.min(discountAmount, eligibleTotal);
    let remainingDiscount = cappedDiscount;
    let remainingTotal = eligibleTotal;

    eligibleRows.forEach((item, index) => {
      let amount;
      if (index === eligibleRows.length - 1) {
        amount = remainingDiscount;
      } else {
        amount = Math.round(cappedDiscount * (item.variant.price / eligibleTotal));
        amount = Math.min(amount, item.variant.price, remainingDiscount);
      }
      allocations.set(item.row, Math.max(0, amount));
      remainingDiscount -= amount;
      remainingTotal -= item.variant.price;
    });

    return allocations;
  }

  function calculateDiscountState(container) {
    const config = parseDiscountConfig(container);
    const items = getSelectedBundleRows(container);
    const selectedItems = items.filter(item => item.selected);
    const selectedRecommendations = selectedItems.filter(item => item.index > 0);
    const availableItems = items.filter(item => item.variant && item.variant.available);
    const baseTotal = selectedItems.reduce((sum, item) => sum + item.variant.price, 0);
    const originalTotal = selectedItems.reduce((sum, item) => {
      const compare = item.variant.compareAtPrice > item.variant.price ? item.variant.compareAtPrice : item.variant.price;
      return sum + compare;
    }, 0);

    const inactiveState = {
      active: false,
      config,
      allocations: new Map(),
      baseTotal,
      discountedTotal: baseTotal,
      originalTotal,
      message: ''
    };

    if (!config) return inactiveState;

    const allowPartial = config.allowPartial !== false;
    if (!allowPartial && selectedItems.length < availableItems.length) return inactiveState;

    const minimumRecommendations = parseInt(config.minimumRecommendations || '0', 10) || 0;
    if (selectedRecommendations.length < minimumRecommendations) return inactiveState;

    const minimumBundleValue = moneyValueToCents(config.minimumBundleValue);
    if (baseTotal < minimumBundleValue) return inactiveState;

    const type = String(config.discountType || '').toUpperCase();
    let allocations = new Map();

    if (type === 'PERCENTAGE') {
      const percentage = Math.max(0, Math.min(100, parseFloat(config.discountPercentage || 0) || 0));
      if (percentage <= 0) return inactiveState;
      selectedItems.forEach(item => {
        allocations.set(item.row, Math.round(item.variant.price * (percentage / 100)));
      });
    } else if (type === 'FIXED') {
      const fixedAmount = moneyValueToCents(config.discountAmount);
      if (fixedAmount <= 0) return inactiveState;
      allocations = allocateFixedDiscount(selectedItems, fixedAmount);
    } else if (type === 'CHEAPEST_FREE') {
      const cheapest = selectedRecommendations
        .filter(item => item.variant && item.variant.price > 0)
        .sort((a, b) => a.variant.price - b.variant.price)[0];
      if (!cheapest) return inactiveState;
      allocations.set(cheapest.row, cheapest.variant.price);
    } else {
      return inactiveState;
    }

    const discountTotal = Array.from(allocations.values()).reduce((sum, amount) => sum + amount, 0);
    if (discountTotal <= 0) return inactiveState;

    return {
      active: true,
      config,
      allocations,
      baseTotal,
      discountedTotal: Math.max(0, baseTotal - discountTotal),
      originalTotal: Math.max(originalTotal, baseTotal)
    };
  }

  function discountTypeShowsWidgetSubheading(type) {
    const normalized = String(type || '').toUpperCase();
    return normalized === 'PERCENTAGE' || normalized === 'FIXED';
  }

  function getSubheadingText(container) {
    const inner = container.classList.contains('iconic-fbt-inner')
      ? container
      : container.querySelector('.iconic-fbt-inner');
    const raw =
      (inner && inner.dataset.fbtSubheadingText) ||
      container.closest('.iconic-block-fbt')?.dataset.fbtSubheadingText ||
      '';
    return String(raw).trim();
  }

  function updateSubheading(container, discountState) {
    const subheadingWrap = container.querySelector('[data-fbt-subheading]');
    if (!subheadingWrap) return;

    const text = getSubheadingText(container);
    const block = container.closest('.iconic-block-fbt');
    const inEditor = isFbtThemeEditor(block);
    const showForDiscount =
      discountState &&
      discountState.active &&
      discountState.config &&
      discountTypeShowsWidgetSubheading(discountState.config.discountType);

    if (text && (inEditor || showForDiscount)) {
      subheadingWrap.style.removeProperty('display');
      const paragraph = subheadingWrap.querySelector('p');
      if (paragraph) paragraph.textContent = text;
      else subheadingWrap.textContent = text;
    } else {
      subheadingWrap.style.display = 'none';
    }
  }

  function buildPriceHtml(current, original, sym, code, container, options) {
    options = options || {};
    const isTotalRow = options.isTotalRow === true;
    const discountActiveForTotal = options.discountActiveForTotal === true;

    const showSale = getFbtSetting(container, 'showRegularSalePrices', 'true') === 'true';
    const showCompare = getFbtSetting(container, 'showCompareAtPrices', 'true') === 'true';

    const hasPriceGap = original > current;
    const bundleStrikeClass =
      isTotalRow && discountActiveForTotal && hasPriceGap && !showCompare
        ? ' iconic-fbt-bundle-total-strike'
        : '';

    const payClass = showSale ? 'iconic-fbt-current-price' : 'iconic-fbt-pay-amount';
    const saleHtml = `<span class="${payClass}">${formatMoney(current, sym)}${code}</span>`;
    const compareHtml = `<s class="iconic-fbt-original-price${bundleStrikeClass}">${formatMoney(original, sym)}${code}</s>`;

    let hasCompare = hasPriceGap && showCompare;
    if (isTotalRow && discountActiveForTotal && hasPriceGap) {
      hasCompare = true;
    }

    const themeOrder = getFbtSetting(container, 'priceOrder', 'sale_first') || 'sale_first';
    const order = isTotalRow ? 'sale_first' : themeOrder;

    if (showSale && !showCompare) {
      if (isTotalRow && discountActiveForTotal && hasPriceGap) {
        return saleHtml + compareHtml;
      }
      return saleHtml;
    }
    if (!showSale && showCompare) {
      if (!hasCompare) return '';
      if (order === 'compare_first' && hasCompare) {
        return compareHtml + saleHtml;
      }
      return hasCompare ? (saleHtml + compareHtml) : saleHtml;
    }
    if (!showSale && !showCompare) return '';

    if (order === 'compare_first' && hasCompare) {
      return compareHtml + saleHtml;
    }
    return hasCompare ? (saleHtml + compareHtml) : saleHtml;
  }

  function updateRowPriceDisplay(row, container, sym, discountState) {
    const priceEl = row.querySelector('[data-fbt-row-price]');
    const v = getVariantFromRow(row);
    if (!priceEl || !v) return;

    const currencyCode = getFbtSetting(container, 'currencyCode', '');
    const code = currencyCode ? ` ${currencyCode}` : '';

    let displayCurrent = v.price;
    let displayOriginal = v.compareAtPrice > v.price ? v.compareAtPrice : 0;

    if (discountState && discountState.active && discountState.allocations.has(row)) {
      const discountAmount = discountState.allocations.get(row) || 0;
      displayCurrent = Math.max(0, v.price - discountAmount);
      displayOriginal = v.compareAtPrice > v.price ? v.compareAtPrice : v.price;
    }

    priceEl.innerHTML = buildPriceHtml(displayCurrent, displayOriginal, sym, code, container);
  }

  function handleVariantChangeCore(select, container) {
    const row = select.closest('.iconic-fbt-row');
    if (!row) return;

    const block = container.closest('.iconic-block-fbt');
    const sym = block ? block.dataset.currencySymbol : '$';

    const v = getVariantFromRow(row);
    const cb = getRowCheckbox(row);
    if (cb && v && v.available === false) {
      cb.checked = false;
      cb.disabled = true;
    } else if (cb && v && v.available === true) {
      cb.disabled = false;
    }

    const opt = select.options[select.selectedIndex];
    if (opt && opt.dataset.image && opt.dataset.image.trim() !== '') {
      const idx = row.getAttribute('data-index');
      if (idx) {
        const visualItem = container.querySelector(`.iconic-fbt-visual-item[data-fbt-index="${idx}"]`);
        if (visualItem) {
          const img = visualItem.querySelector('img');
          if (img) {
            img.src = opt.dataset.image;
            img.removeAttribute('srcset');
            img.removeAttribute('sizes');
          }
        }
      }
    }

    updateTotal(container);
  }

  function updateVisualVisibility(container) {
    const visualRow = container.querySelector('.iconic-fbt-visual-row');
    if (!visualRow) return;

    getBundleRows(container).forEach(row => {
      let idx = row.getAttribute('data-index');
      let cb = getRowCheckbox(row);
      let item = visualRow.querySelector(`.iconic-fbt-visual-item[data-fbt-index="${idx}"]`);

      if (item) {
        if (cb && cb.checked) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      }
    });

    // Show/Hide Pluses
    visualRow.querySelectorAll('.iconic-fbt-plus').forEach(plus => {
      let k = parseInt(plus.getAttribute('data-fbt-plus-after'), 10);
      let rowK = getBundleRowByIndex(container, k);
      let cbK = rowK ? getRowCheckbox(rowK) : null;

      let hasLaterChecked = false;
      getBundleRows(container).forEach(row => {
        let idx = parseInt(row.getAttribute('data-index'), 10);
        if (idx > k) {
          let cb = getRowCheckbox(row);
          if (cb && cb.checked) hasLaterChecked = true;
        }
      });

      if (cbK && cbK.checked && hasLaterChecked) {
        plus.style.display = 'inline-flex';
      } else {
        plus.style.display = 'none';
      }
    });

    updateVisualArrows(container);
  }

  /** Checked bundle rows that have a matching thumbnail in the visual strip (source of truth for slider threshold). */
  function countCheckedVisualImages(container) {
    const visualRow = container.querySelector('.iconic-fbt-visual-row');
    if (!visualRow) return 0;
    let n = 0;
    getBundleRows(container).forEach(function (row) {
      const cb = getRowCheckbox(row);
      if (!cb || !cb.checked) return;
      const idx = row.getAttribute('data-index');
      if (!idx) return;
      if (visualRow.querySelector('.iconic-fbt-visual-item[data-fbt-index="' + idx + '"]')) n += 1;
    });
    return n;
  }

  function isVisualItemShown(item) {
    if (!item) return false;
    const st = window.getComputedStyle(item);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    const rect = item.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function fbtUseDesktopSliderCountRule(container) {
    if (container && container.closest('.iconic-block-fbt--product-details')) return false;
    if (typeof window.matchMedia !== 'function') return true;
    return window.matchMedia(FBT_SLIDER_DESKTOP_COUNT_MEDIA).matches;
  }

  function updateVisualArrows(container) {
    container.querySelectorAll('.iconic-fbt-list-visual-wrap').forEach(function (wrap) {
      var row = wrap.querySelector('[data-fbt-visual-row]');
      var prevBtn = wrap.querySelector('.iconic-fbt-list-visual-prev');
      var nextBtn = wrap.querySelector('.iconic-fbt-list-visual-next');
      if (!row || !prevBtn || !nextBtn) return;

      function measureAndApply() {
        var visibleItems = Array.from(row.querySelectorAll('.iconic-fbt-visual-item')).filter(isVisualItemShown);
        var visibleWidth = visibleItems.reduce(function (total, item) {
          return total + item.offsetWidth;
        }, 0);
        var visiblePluses = Array.from(row.querySelectorAll('.iconic-fbt-plus')).filter(isVisualItemShown);
        var visiblePlusWidth = visiblePluses.reduce(function (total, plus) {
          return total + plus.offsetWidth;
        }, 0);
        var rowStyles = window.getComputedStyle(row);
        var gap = parseFloat(rowStyles.columnGap || rowStyles.gap || '0') || 0;
        var visibleChildrenCount = visibleItems.length + visiblePluses.length;
        var visibleContentWidth = visibleWidth + visiblePlusWidth + Math.max(0, visibleChildrenCount - 1) * gap;
        var visibleThumbCount = visibleItems.length;
        var hasOverflow = visibleContentWidth > row.clientWidth + 1;
        var maxScroll = hasOverflow ? Math.max(0, Math.floor(row.scrollWidth - row.clientWidth)) : 0;

        /* Large desktop only: ≤4 visible thumbs = no slider (mobile/tablet never hit by media query). */
        var sliderDisabled = fbtUseDesktopSliderCountRule(wrap) && visibleThumbCount <= 4;

        var topWrapper = wrap.closest('.iconic-fbt-top-wrapper');

        if (sliderDisabled) {
          row.scrollLeft = 0;
          prevBtn.style.display = 'none';
          nextBtn.style.display = 'none';
          prevBtn.disabled = true;
          nextBtn.disabled = true;
          row.dataset.sliderDisabled = 'true';
          row.classList.remove('is-dragging');
          if (topWrapper) topWrapper.classList.add('iconic-fbt-top-wrapper--strip-fit-all');
        } else {
          if (topWrapper) topWrapper.classList.remove('iconic-fbt-top-wrapper--strip-fit-all');
          if (row.scrollLeft > maxScroll) row.scrollLeft = maxScroll;
          var scrollLeft = Math.ceil(row.scrollLeft);
          prevBtn.style.display = '';
          nextBtn.style.display = '';
          prevBtn.disabled = scrollLeft <= 0;
          nextBtn.disabled = !hasOverflow || maxScroll <= 1 || scrollLeft >= maxScroll - 1;
          row.dataset.sliderDisabled = 'false';
        }
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(measureAndApply);
      });
    });
  }

  function updateTotal(container) {
    const totalEl = container.querySelector('[data-fbt-total]');
    const originalTotalEl = container.querySelector('[data-fbt-original-total]');
    const btn = container.querySelector('[data-fbt-add-selected]');
    if (!totalEl) return;

    const sym = container.closest('.iconic-block-fbt').dataset.currencySymbol;
    const currencyCode = getFbtSetting(container, 'currencyCode', '');
    const code = currencyCode ? ` ${currencyCode}` : '';
    const discountState = calculateDiscountState(container);
    updateSubheading(container, discountState);
    getBundleRows(container).forEach(row => {
      updateRowPriceDisplay(row, container, sym, discountState);
    });

    const total = discountState.baseTotal;
    const originalTotal = discountState.originalTotal;
    const discountedTotal = discountState.discountedTotal;
    const anySelected = total > 0;

    const showSale = getFbtSetting(container, 'showRegularSalePrices', 'true') === 'true';
    const showCompare = getFbtSetting(container, 'showCompareAtPrices', 'true') === 'true';
    const totalWrap = container.querySelector('.iconic-fbt-total-wrap');

    if (!showSale && !showCompare) {
      if (totalWrap) totalWrap.style.display = 'none';
      if (btn) btn.disabled = !anySelected || total <= 0;
      updateVisualVisibility(container);
      return;
    }

    if (totalWrap) totalWrap.style.display = '';

    let displayOriginalTotal = 0;
    if (discountState.active) {
      displayOriginalTotal = Math.max(originalTotal, total);
    } else if (originalTotal > total) {
      displayOriginalTotal = originalTotal;
    }

    const hasCompareForTotal = showCompare && displayOriginalTotal > discountedTotal;

    const savingsEl = container.querySelector('[data-fbt-savings]');

    if (originalTotalEl) originalTotalEl.style.display = 'none';

    const totalPriceOptions = { isTotalRow: true, discountActiveForTotal: discountState.active };

    if (showSale && !showCompare) {
      totalEl.innerHTML = buildPriceHtml(discountedTotal, displayOriginalTotal, sym, code, container, totalPriceOptions);
    } else if (!showSale && showCompare) {
      totalEl.innerHTML = hasCompareForTotal ? buildPriceHtml(discountedTotal, displayOriginalTotal, sym, code, container, totalPriceOptions) : '';
    } else {
      totalEl.innerHTML = buildPriceHtml(discountedTotal, displayOriginalTotal, sym, code, container, totalPriceOptions);
    }

    if (savingsEl) {
      const diff = displayOriginalTotal - discountedTotal;
      const showSavings =
        diff > 0 &&
        (discountState.active || (showCompare && displayOriginalTotal > discountedTotal));
      if (showSavings) {
        savingsEl.textContent = `You Save ${formatMoney(diff, sym)}${code}`;
        savingsEl.style.display = '';
      } else {
        savingsEl.style.display = 'none';
      }
    }

    if (btn) btn.disabled = !anySelected || total <= 0;
    updateVisualVisibility(container);
  }

  /**
   * Recompute totals/discount from the live DOM (no cached selection).
   * Multiple passes catch themes that toggle the checkbox after our first read.
   */
  function scheduleUpdateTotalFromCheckbox(container) {
    updateTotal(container);
    requestAnimationFrame(function () {
      updateTotal(container);
      setTimeout(function () {
        updateTotal(container);
      }, 0);
    });
  }

  function initMouseDrag(container) {
    const slider = container.querySelector('.iconic-fbt-visual-row');
    if (!slider || slider.dataset.dragInit) return;
    slider.dataset.dragInit = 'true';

    let isDown = false;
    let startX;
    let scrollLeft;

    slider.addEventListener('mousedown', (e) => {
      if (slider.dataset.sliderDisabled === 'true') return;
      isDown = true;
      slider.classList.add('is-dragging');
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener('mouseleave', () => {
      isDown = false;
      slider.classList.remove('is-dragging');
    });

    slider.addEventListener('mouseup', () => {
      isDown = false;
      slider.classList.remove('is-dragging');
    });

    slider.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 2;
      slider.scrollLeft = scrollLeft - walk;
    });
  }

  function ensureFbtGlobalResizeListener() {
    if (window.__iconicFbtGlobalResizeBound) return;
    window.__iconicFbtGlobalResizeBound = true;
    window.addEventListener('resize', function () {
      if (window.__iconicFbtResizeRaf) cancelAnimationFrame(window.__iconicFbtResizeRaf);
      window.__iconicFbtResizeRaf = requestAnimationFrame(function () {
        document.querySelectorAll('[data-iconic-fbt]').forEach(function (el) {
          if (el.dataset.iconicFbtBound === 'true') updateVisualArrows(el);
        });
      });
    });
  }

  function initListVisualArrows(container) {
    ensureFbtGlobalResizeListener();
    container.querySelectorAll('.iconic-fbt-list-visual-wrap').forEach(function (wrap) {
      if (wrap.dataset.arrowsInit) return;
      wrap.dataset.arrowsInit = 'true';

      var row = wrap.querySelector('[data-fbt-visual-row]');
      var prevBtn = wrap.querySelector('.iconic-fbt-list-visual-prev');
      var nextBtn = wrap.querySelector('.iconic-fbt-list-visual-next');
      if (!row || !prevBtn || !nextBtn) return;

      function updateArrowState() {
        updateVisualArrows(container);
      }

      var scrollStep = function () {
        return Math.max(120, row.clientWidth * 0.8);
      };

      prevBtn.addEventListener('click', function () {
        if (row.dataset.sliderDisabled === 'true') return;
        row.scrollBy({ left: -scrollStep(), behavior: 'smooth' });
      });
      nextBtn.addEventListener('click', function () {
        if (row.dataset.sliderDisabled === 'true') return;
        row.scrollBy({ left: scrollStep(), behavior: 'smooth' });
      });

      row.addEventListener('scroll', updateArrowState);

      setTimeout(updateArrowState, 100);
    });
  }

  function bindFbt(container) {
    const sym = container.closest('.iconic-block-fbt').dataset.currencySymbol;
    if (container.dataset.iconicFbtBound) {
      updateTotal(container);
      return;
    }
    container.dataset.iconicFbtBound = 'true';

    setStatus(container, '', '');

    // FIX: Recalculate total on init so ALL checked products are included immediately.
    updateTotal(container);

    // Use event delegation for variant select changes (works for dynamically added elements)

    // Helper function to handle variant change
    const handleVariantChange = (select) => {
      handleVariantChangeCore(select, container);
    };

    // Method 1: Direct listeners on existing selects
    container.querySelectorAll('[data-fbt-variant-select]').forEach(select => {
      select.addEventListener('change', e => handleVariantChange(e.target, e));
    });

    // Method 2: Container delegation as backup
    container.addEventListener('change', e => {
      if (e.target && e.target.matches && e.target.matches('[data-fbt-variant-select]')) {
        handleVariantChange(e.target, e);
      }
    });

    // Checkbox / bundle selection: always read live DOM; multi-pass + label click for flaky themes.
    function onCheckboxDelegatedEvent(e) {
      const tgt = e.target;
      if (!tgt || !tgt.matches) return;
      if (tgt.matches('input[type="checkbox"][data-fbt-checkbox]')) {
        scheduleUpdateTotalFromCheckbox(container);
      }
    }

    container.addEventListener('change', onCheckboxDelegatedEvent);
    container.addEventListener('input', onCheckboxDelegatedEvent);

    container.addEventListener('click', function onFbtCheckboxWrapClick(e) {
      if (!e.target.closest || !e.target.closest('.iconic-fbt-list')) return;
      if (!e.target.closest('.iconic-fbt-checkbox-wrap')) return;
      if (e.target.closest('.iconic-fbt-product-title-link')) return;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          scheduleUpdateTotalFromCheckbox(container);
        });
      });
    });

    // -------------------------------------------------------------------------
    // ADD TO CART — batch add with bundle properties for Discount Function
    // -------------------------------------------------------------------------
    const addBtn = container.querySelector('[data-fbt-add-selected]');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (addBtn.disabled) return;
        setStatus(container, '', '');

        // Collect all selected rows with their product IDs
        const rows = getBundleRows(container);
        const selectedRows = [];

        rows.forEach(row => {
          const cb = getRowCheckbox(row);
          const v = getVariantFromRow(row);
          if (cb && cb.checked && v && v.id && v.available) {
            selectedRows.push({
              variantId: String(v.id),
              productId: row.getAttribute('data-product-id') || '',
              isMain: row.getAttribute('data-index') === '0'
            });
          }
        });

        if (selectedRows.length === 0) return;
        setBusy(container, true);

        // Unique ID that groups all lines of this bundle together in the cart
        const bundleId = 'fbt_' + Date.now();

        // Main product ID — used by Discount Function to locate the right metafield
        const mainItem = selectedRows.find(r => r.isMain);
        const mainProductId =
          (mainItem && mainItem.productId)
            ? mainItem.productId
            : (container.dataset.fbtProductId || '');

        // Build items array — line properties carry bundle context to the Discount Function
        const items = selectedRows.map(r => ({
          id: r.variantId,
          quantity: 1,
          properties: {
            '_fbt_bundle_id': bundleId,          // groups all bundle lines together
            '_fbt_role':      r.isMain ? 'main' : 'rec', // identifies anchor product
            '_fbt_main_pid':  mainProductId       // tells Function which metafield to read
          }
        }));

        // Single batch POST — faster than sequential and atomic
        fetch(CART_ADD_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({ items })
        })
          .then(res => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            window.location.href = CART_URL;
          })
          .catch(() => {
            setStatus(container, DEFAULT_ERROR_MESSAGE, 'error');
            setBusy(container, false);
          });
      });
    }

    updateTotal(container);
    initMouseDrag(container);
    initListVisualArrows(container);
  }

  function escapeHtml(unsafe) {
    return (unsafe || '').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function truncateText(text, maxLength) {
    const len = parseInt(maxLength, 10) || 100;
    const str = String(text || '');
    if (str.length <= len) return str;
    return str.substring(0, len) + '...';
  }

  function renderRatingStars(ratingValue, icon) {
    const parsed = parseFloat(ratingValue);
    const rating = Number.isFinite(parsed) ? Math.max(0, Math.min(5, parsed)) : 0;
    const displayRating = rating.toFixed(1);
    const star = escapeHtml(icon || '\u2605');
    const stars = star.repeat(5);
    const fillPercent = Math.round(rating * 20 * 10) / 10;

    return `<span class="iconic-fbt-rating-stars" role="img" aria-label="${displayRating} out of 5 stars"><span class="iconic-fbt-rating-empty" aria-hidden="true">${stars}</span><span class="iconic-fbt-rating-filled" aria-hidden="true" style="width: ${fillPercent}%;">${stars}</span></span><span class="iconic-fbt-rating-value">${displayRating}</span>`;
  }

  /** Canonical PDP URL from Storefront-style recommendation payload. */
  function getProductPageUrl(product) {
    if (!product) return '#';
    const direct = product.url || product.onlineStoreUrl;
    if (direct && String(direct).trim()) return String(direct).trim();
    const h = product.handle && String(product.handle).trim();
    if (h) return '/products/' + h;
    return '#';
  }

  function variantIdFromPayload(id) {
    const s = String(id || '').trim();
    if (!s) return '';
    const parts = s.split('/');
    return parts[parts.length - 1] || s;
  }

  function trimVariantOptionLabel(opt) {
    if (!opt || opt.dataset.fbtVariantTrimmed === '1') return;
    const text = (opt.textContent || '').trim();
    const firstSlash = text.indexOf(' / ');
    if (firstSlash > -1) {
      const firstSegment = text.slice(0, firstSlash);
      if (firstSegment.indexOf(' - ') > -1) {
        opt.textContent = text.slice(firstSlash + 3).trim();
      }
    }
    opt.dataset.fbtVariantTrimmed = '1';
  }

  function trimVariantSelect(select) {
    if (!select || !select.options) return;
    for (let i = 0; i < select.options.length; i++) trimVariantOptionLabel(select.options[i]);
  }

  function applyVariantLabelTrim(root) {
    if (!root) return;
    root.querySelectorAll('.iconic-fbt-variant-select').forEach(trimVariantSelect);
  }

  // Strip "Product - Subtitle / " prefix from variant dropdown labels (theme + API rows).
  function initVariantLabelTrim(root) {
    if (!root || root.dataset.fbtVariantTrimInit === 'true') return;
    root.dataset.fbtVariantTrimInit = 'true';
    applyVariantLabelTrim(root);
    if (typeof MutationObserver === 'undefined') return;
    new MutationObserver(function () {
      applyVariantLabelTrim(root);
    }).observe(root, { childList: true, subtree: true });
  }

  function isFbtThemeEditor(block) {
    if (!block) return false;
    if (block.dataset.fbtDesignMode === 'true') return true;
    return typeof Shopify !== 'undefined' && !!Shopify.designMode;
  }

  function getHiddenNoticeCopy(data, productTitle) {
    const name = (productTitle || '').trim() || 'this product';
    const safeName = escapeHtml(name);
    if (data && data.productWidgetDisabled) {
      return {
        line1:
          'Frequently Bought Together is hidden because <strong>' +
          safeName +
          '</strong> has the widget disabled in the app.',
        line2: 'Open the app → Bundle setup → Hidden widgets to change this.',
      };
    }
    return {
      line1:
        'No recommendations are showing for <strong>' + safeName + '</strong> yet.',
      line2: 'Open the app to add manual, global, or smart recommendations.',
    };
  }

  function showFbtEditorHiddenNotice(block, apiData) {
    const inner = block.querySelector('.iconic-fbt-inner');
    if (inner) inner.style.display = 'none';

    block.style.display = '';
    block.classList.add('iconic-block-fbt--editor-notice');

    let notice = block.querySelector('[data-fbt-editor-notice]');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'iconic-fbt-editor-notice';
      notice.setAttribute('data-fbt-editor-notice', '');
      const section = block.querySelector('.iconic-fbt-section');
      if (section) section.prepend(notice);
      else block.prepend(notice);
    }

    const copy = getHiddenNoticeCopy(apiData, block.dataset.fbtProductTitle || '');
    notice.innerHTML = '<p>' + copy.line1 + '</p><p>' + copy.line2 + '</p>';
    notice.removeAttribute('hidden');
  }

  function hideFbtWidget(container, apiData) {
    const block = container && container.closest ? container.closest('.iconic-block-fbt') : null;
    if (block && isFbtThemeEditor(block)) {
      showFbtEditorHiddenNotice(block, apiData);
      return;
    }
    if (block) {
      block.style.display = 'none';
      return;
    }
    if (container) container.style.display = 'none';
  }

  function shouldShowFbtFromApiData(data) {
    if (!data || data.widgetDisabled === true) return false;
    const products = data.recommendationProducts;
    return Array.isArray(products) && products.length > 0;
  }

  async function fetchRecommendations() {
    const containers = document.querySelectorAll('[data-iconic-fbt][data-fbt-source="api"]');
    for (const container of containers) {
      if (container.dataset.fetched) continue;
      container.dataset.fetched = 'true';

      const shop =
        (container.dataset && container.dataset.fbtShop) ||
        (window.IconicFbtSettings && window.IconicFbtSettings.shop) ||
        '';
      const productId =
        (container.dataset && container.dataset.fbtProductId) ||
        (window.IconicFbtSettings && window.IconicFbtSettings.productId) ||
        '';
      const blockEl = container.closest('.iconic-block-fbt');
      const sym = (blockEl && blockEl.dataset.currencySymbol) || '$';

      if (!IconicFbtApi) {
        hideFbtWidget(container, { widgetDisabled: true });
        continue;
      }

      if (!shop || !productId) {
        hideFbtWidget(container, { widgetDisabled: true });
        continue;
      }

      try {
        const data = await IconicFbtApi.fetchRecommendations(shop, productId, container);
        if (!shouldShowFbtFromApiData(data)) {
          hideFbtWidget(container, data);
          continue;
        }

        const currencyFromApi =
          (data.recommendationProducts[0] && data.recommendationProducts[0].currencyCode) ||
          data.currencyCode;
        if (currencyFromApi && container.dataset) {
          container.dataset.currencyCode = String(currencyFromApi);
        }

        if (data && data.recommendationProducts && data.recommendationProducts.length > 0) {
          const visualRow = container.querySelector('.iconic-fbt-visual-row');
          const listRow = container.querySelector('.iconic-fbt-list');

          const mainRow = listRow ? listRow.querySelector('.iconic-fbt-row[data-index="0"]') : null;
          const mainRating = mainRow ? parseFloat(mainRow.getAttribute('data-rating')) || 0 : 0;

          // ---------------------------------------------------------------
          // NEW: stamp the main product ID onto the main row (index 0)
          // so the Discount Function can locate its metafield via cart properties
          // ---------------------------------------------------------------
          if (mainRow && productId) {
            mainRow.setAttribute('data-product-id', String(productId));
          }

          let anyProductHasReviews = mainRating > 0;
          data.recommendationProducts.forEach((product) => {
            const ratingVal = product.rating ? parseFloat(product.rating) : 0;
            if (ratingVal > 0) anyProductHasReviews = true;
          });

          if (mainRow) {
            const mainReviewWrap = mainRow.querySelector('.iconic-fbt-reviews');
            if (mainReviewWrap) {
              if (anyProductHasReviews) {
                mainReviewWrap.style.removeProperty('display');
              } else {
                mainReviewWrap.style.display = 'none';
              }
            }
          }
          const blockNode = container.closest('.iconic-block-fbt');
          const maxLength = blockNode ? blockNode.dataset.fbtProductNameMaxLength : undefined;

          data.recommendationProducts.forEach((product, i) => {
            const index = i + 1; // 0 is main product
            const unitPrice =
              product.price != null && Number.isFinite(Number(product.price))
                ? Number(product.price)
                : product.variants && product.variants[0] && product.variants[0].price != null
                  ? Number(product.variants[0].price)
                  : 0;
            const priceCents = Math.round(unitPrice * 100);

            // Visual Row
            if (visualRow) {
              const plus = document.createElement('span');
              plus.className = 'iconic-fbt-plus';
              plus.setAttribute('data-fbt-plus-after', String(index - 1));
              plus.textContent = '+';
              visualRow.appendChild(plus);

              const visualItem = document.createElement('div');
              visualItem.className = 'iconic-fbt-visual-item';
              visualItem.setAttribute('data-fbt-index', String(index));
              const firstVariantImage = product.variants && product.variants[0] && product.variants[0].image ? product.variants[0].image : product.image;
              visualItem.innerHTML = `<img src="${escapeHtml(firstVariantImage)}" alt="${escapeHtml(truncateText(product.title, maxLength))}" loading="lazy" class="iconic-top-img iconic-d-block iconic-w-100 iconic-h-100 iconic-mw-100">`;
              visualRow.appendChild(visualItem);
            }

            // List Row
            if (listRow) {
              const row = document.createElement('div');
              row.className = 'iconic-fbt-row';
              row.setAttribute('data-fbt-row', '');
              row.setAttribute('data-index', String(index));

              // -----------------------------------------------------------------
              // NEW: store the recommendation product ID on the row element
              // The add-to-cart handler reads this and passes it as _fbt_main_pid
              // in the cart line properties so the Discount Function can look up
              // the correct product metafield without needing an external API call
              // -----------------------------------------------------------------
              if (product.id) {
                row.setAttribute('data-product-id', String(product.id));
              }

              let variantsHtml = '';
              if (product.variants && product.variants.length > 1) {
                variantsHtml = `<select class="iconic-fbt-variant-select" data-fbt-variant-select>`;
                product.variants.forEach((v, vIdx) => {
                  const vId = variantIdFromPayload(v.id);
                  const vPrice = Math.round(v.price * 100);
                  const vCompareAt = v.compareAtPrice ? Math.round(v.compareAtPrice * 100) : 0;
                  const vImage = v.image || product.image || '';
                  variantsHtml += `<option value="${vId}" data-price="${vPrice}" data-compare-at-price="${vCompareAt}" data-available="${v.availableForSale}" data-image="${escapeHtml(vImage)}">${escapeHtml(truncateText(v.title, maxLength))}</option>`;
                });
                variantsHtml += `</select>`;
              } else if (product.variants && product.variants.length === 1) {
                const v = product.variants[0];
                const vId = variantIdFromPayload(v.id);
                const vPrice = Math.round(v.price * 100);
                const vCompareAt = v.compareAtPrice ? Math.round(v.compareAtPrice * 100) : 0;
                variantsHtml = `<input type="hidden" data-fbt-variant-id value="${vId}" data-price="${vPrice}" data-compare-at-price="${vCompareAt}" data-available="${v.availableForSale}">`;
              }

              let reviewsHtml = '';
              const showReviews = blockNode && blockNode.dataset.showReviews === 'true';
              const ratingVal = product.rating ? parseFloat(product.rating) : 0.0;
              const ratingCount = product.ratingCount || 0;
              if (showReviews && anyProductHasReviews) {
                const iconFilled = (blockNode && blockNode.dataset.fbtRatingIconDefault) || '★';
                const showReviewCount = blockNode && blockNode.dataset.fbtShowReviewCount === 'true';
                const starsHtml = renderRatingStars(ratingVal, iconFilled);
                const countHtml = showReviewCount ? ` <span class="iconic-fbt-review-count">(${ratingCount} reviews)</span>` : '';
                reviewsHtml = `<div class="iconic-fbt-reviews">${starsHtml}${countHtml}</div>`;
              }

              const productUrl = getProductPageUrl(product);
              const blockId =
                (container.dataset && container.dataset.fbtBlockId) ||
                'fbt-' + Math.random().toString(36).slice(2, 10);
              const cbDomId = 'iconic-fbt-cb-' + blockId + '-' + index;

              row.innerHTML = `
                <div class="iconic-fbt-checkbox-wrap">
                  <label class="iconic-fbt-checkbox-label" for="${escapeHtml(cbDomId)}">
                    <input id="${escapeHtml(cbDomId)}" type="checkbox" class="iconic-fbt-checkbox" data-fbt-checkbox ${product.available ? 'checked' : 'disabled'}>
                  </label>
                  <span class="iconic-fbt-row-label"><a href="${escapeHtml(productUrl)}" class="iconic-fbt-product-title-link">${escapeHtml(truncateText(product.title, maxLength))}</a></span>
                </div>
                ${variantsHtml}
                <div class="iconic-fbt-price-review-wrap">
                  <div class="iconic-fbt-row-price" data-fbt-row-price>
                    ${(() => {
                      const pCompareAt = product.compareAtPrice ? Math.round(product.compareAtPrice * 100) : 0;
                      let displayCurrent = priceCents;
                      let displayOriginal = pCompareAt > priceCents ? pCompareAt : 0;
                      const dynamicCurrencyCode = getFbtSetting(container, 'currencyCode', '');
                      const code = dynamicCurrencyCode ? ' ' + dynamicCurrencyCode : '';
                      return buildPriceHtml(displayCurrent, displayOriginal, sym, code, container);
                    })()}
                  </div>
                  ${reviewsHtml}
                </div>
              `;
              listRow.appendChild(row);
            }
          });
        }

        const blockRoot = container.closest('.iconic-block-fbt');
        if (blockRoot) {
          blockRoot.classList.remove('iconic-block-fbt--editor-notice');
          const editorNotice = blockRoot.querySelector('[data-fbt-editor-notice]');
          if (editorNotice) editorNotice.setAttribute('hidden', '');
          const inner = container;
          if (inner) inner.style.removeProperty('display');
        }

        bindFbt(container);
        updateTotal(container);
        container.style.opacity = '1';
      } catch (e) {
        console.error('Error fetching FBT recommendations from API:', e);
        hideFbtWidget(container, { widgetDisabled: true });
      }
    }
  }

  function initLayoutDetection() {
    document.querySelectorAll('.iconic-block-fbt').forEach(function (block) {
      initVariantLabelTrim(block);
      if (!block.classList.contains('iconic-block-fbt--product-details')) {
        var isProductInfo = block.closest('.product__info-container, .product-info, .product-details-wrapper, .product-form, [id*="ProductInfo"], .product__column--info, form[action*="/cart/add"]');
        if (isProductInfo) {
          block.classList.add('iconic-block-fbt--product-details');
        }
      }
    });
  }

  function init() {
    initLayoutDetection();
    if (typeof window.matchMedia === 'function' && !window.__iconicFbtSliderMqlBound) {
      window.__iconicFbtSliderMqlBound = true;
      var mql = window.matchMedia(FBT_SLIDER_DESKTOP_COUNT_MEDIA);
      var onViewportSliderModeChange = function () {
        document.querySelectorAll('[data-iconic-fbt]').forEach(function (el) {
          if (el.dataset.iconicFbtBound === 'true') updateVisualArrows(el);
        });
      };
      if (mql.addEventListener) mql.addEventListener('change', onViewportSliderModeChange);
      else if (mql.addListener) mql.addListener(onViewportSliderModeChange);
    }

    // Bind only custom ones initially. API ones are bound after rendering.
    document.querySelectorAll('[data-iconic-fbt][data-fbt-source="custom"]').forEach(el => {
      bindFbt(el);
    });
    fetchRecommendations();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Global safety-net: checkbox change (capture) so discount recalculates even if bubble is stopped.
  if (!window.__iconicFbtCheckboxCaptureBound) {
    window.__iconicFbtCheckboxCaptureBound = true;
    document.addEventListener(
      'change',
      function iconicFbtGlobalCheckboxSync(e) {
        if (!e.target || !e.target.matches('input[type="checkbox"][data-fbt-checkbox]')) return;
        const widget = e.target.closest('[data-iconic-fbt]');
        if (!widget || widget.dataset.iconicFbtBound !== 'true') return;
        scheduleUpdateTotalFromCheckbox(widget);
      },
      true
    );
  }

  // Global safety-net handler for variant select changes
  // (backup in case bindFbt's direct/delegated listeners are blocked by other scripts)
  document.addEventListener('change', function (e) {
    if (!e.target || !e.target.hasAttribute('data-fbt-variant-select')) return;
    const select = e.target;
    const container = select.closest('[data-iconic-fbt]');
    if (!container || container.dataset.iconicFbtBound !== 'true') return;
    const row = select.closest('.iconic-fbt-row');
    if (!row) return;
    handleVariantChangeCore(select, container);
  });
})();
