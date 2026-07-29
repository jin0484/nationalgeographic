(() => {
  'use strict';

  const DATA_URL = 'data/mock_data.json';
  const MIN_LOADING_TIME = 400;
  const BANNER_AUTOPLAY_MS = 10000;
  const TOAST_DURATION_MS = 5000;
  const DRAG_THRESHOLD_PX = 60;
  const RECENT_SEARCH_MAX = 5;
  const DEFAULT_SEARCH_SUGGESTIONS = ['동물', '여행', '블링크'];

  const STORAGE_KEYS = {
    QUIZ_SCORE: 'natgeo_quiz_score'
  };

  const BOOKMARK_SVG = `<svg viewBox="0 0 12 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9.79718 0.540039C10.2064 0.540039 10.5988 0.70259 10.8881 0.991931C11.1775 1.28127 11.34 1.67371 11.34 2.0829V13.6543C11.34 13.7894 11.3045 13.9221 11.237 14.0392C11.1696 14.1562 11.0726 14.2535 10.9558 14.3213C10.8389 14.3891 10.7063 14.425 10.5712 14.4255C10.4361 14.426 10.3033 14.3909 10.186 14.3239L6.7053 12.3352C6.47223 12.202 6.20845 12.132 5.94004 12.132C5.67162 12.132 5.40785 12.202 5.17478 12.3352L1.6941 14.3239C1.57679 14.3909 1.44395 14.426 1.30886 14.4255C1.17377 14.425 1.04117 14.3891 0.924321 14.3213C0.807474 14.2535 0.710479 14.1562 0.64304 14.0392C0.575601 13.9221 0.540083 13.7894 0.540039 13.6543V2.0829C0.540039 1.67371 0.70259 1.28127 0.991931 0.991931C1.28127 0.70259 1.67371 0.540039 2.0829 0.540039H9.79718Z"/>
  </svg>`;

  const isReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));

  /* ------------------------------------------------------------------ */
  /* Data loading                                                        */
  /* ------------------------------------------------------------------ */

  let natGeoData = null;

  async function fetchNatGeoData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error('Failed to load data');
    return response.json();
  }

  function renderStateMessage(container, message, isError) {
    if (!container) return;
    container.innerHTML = `<p class="state_message${isError ? ' has_error' : ''}">${escapeHtml(message)}</p>`;
  }

  async function initApp() {
    renderSkeletons();

    try {
      const [data] = await Promise.all([fetchNatGeoData(), wait(MIN_LOADING_TIME)]);
      natGeoData = data;
      renderBanners(data.banners);
      renderMapPins(data.todaysExp);
      initQuiz(data.quiz);
      initMagazineCarousel(data.magazine);
      initRecommendAccordion(data.recommend);
      initScrollReveal();
    } catch (error) {
      renderStateMessage(document.getElementById('magazine_grid'), '콘텐츠를 불러오지 못했습니다.', true);
      renderStateMessage(document.getElementById('recommend_grid'), '콘텐츠를 불러오지 못했습니다.', true);
      renderStateMessage(document.getElementById('quiz_card'), '콘텐츠를 불러오지 못했습니다.', true);
      const bannerTrack = document.getElementById('banner_track');
      if (bannerTrack) renderStateMessage(bannerTrack, '콘텐츠를 불러오지 못했습니다.', true);
      document.getElementById('search_toggle_btn').disabled = true;
    }
  }

  function renderSkeletons() {
    const skeletonCard = () => `
      <div class="skeleton_card">
        <div class="skeleton_thumb"></div>
        <div class="skeleton_line"></div>
        <div class="skeleton_line short"></div>
      </div>`;

    const magazineGrid = document.getElementById('magazine_grid');
    if (magazineGrid) magazineGrid.innerHTML = skeletonCard().repeat(4);

    const recommendGrid = document.getElementById('recommend_grid');
    if (recommendGrid) {
      recommendGrid.innerHTML = `
        <div class="skeleton_card" style="height:220px"><div class="skeleton_thumb" style="height:100%"></div></div>
        <div class="skeleton_card" style="height:220px"><div class="skeleton_thumb" style="height:100%"></div></div>
        <div class="skeleton_card" style="height:220px"><div class="skeleton_thumb" style="height:100%"></div></div>
      `;
    }

    const quizCard = document.getElementById('quiz_card');
    if (quizCard) {
      quizCard.innerHTML = `
        <div class="skeleton_line" style="width:30%"></div>
        <div class="skeleton_line" style="height:24px;margin-top:16px"></div>
        <div class="skeleton_line" style="height:48px;margin-top:24px"></div>
        <div class="skeleton_line" style="height:48px;margin-top:8px"></div>
      `;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Banner slider                                                       */
  /* ------------------------------------------------------------------ */

  let bannerItems = [];
  let currentBannerIndex = 0;
  let bannerAutoplayTimer = null;
  let bannerDragState = null;

  function getBannerLayoutParams() {
    const w = window.innerWidth;
    if (w >= 1280) return { sideX: 42, sideScale: 0.76, sideOpacity: 0.32, farX: 64, farScale: 0.6, farOpacity: 0 };
    if (w >= 768) return { sideX: 36, sideScale: 0.84, sideOpacity: 0.4, farX: 56, farScale: 0.7, farOpacity: 0 };
    return { sideX: 28, sideScale: 0.9, sideOpacity: 0.5, farX: 44, farScale: 0.82, farOpacity: 0 };
  }

  // Shortest circular distance from `current` to `i` (e.g. wrapping past the last slide back to 0 yields +1, not +N-1) so the loop always feels continuous.
  function getRelativeOffset(i, current, total) {
    let diff = (i - current) % total;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
  }

  function getBannerContentEls(slide) {
    return [
      slide.querySelector('.banner_title'),
      slide.querySelector('.banner_desc'),
      slide.querySelector('.banner_cta_btn')
    ].filter(Boolean);
  }

  function animateBannerContentIn(slide, animate) {
    const els = getBannerContentEls(slide);
    if (!els.length) return;
    if (window.gsap) {
      gsap.killTweensOf(els);
      if (!animate) {
        gsap.set(els, { opacity: 1, y: 0, filter: 'blur(0px)' });
        return;
      }
      gsap.set(els, { opacity: 0, y: 32, filter: 'blur(14px)' });
      gsap.to(els, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out', stagger: 0.15, delay: 0.2 });
    } else {
      els.forEach((el, idx) => {
        el.style.transition = animate
          ? `opacity 0.9s ease ${0.2 + idx * 0.15}s, transform 0.9s ease ${0.2 + idx * 0.15}s, filter 0.9s ease ${0.2 + idx * 0.15}s`
          : 'none';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        el.style.filter = 'blur(0px)';
      });
    }
  }

  function resetBannerContent(slide) {
    const els = getBannerContentEls(slide);
    if (!els.length) return;
    if (window.gsap) {
      gsap.killTweensOf(els);
      gsap.set(els, { opacity: 0, y: 32, filter: 'blur(14px)' });
    } else {
      els.forEach((el) => {
        el.style.transition = 'none';
        el.style.opacity = '0';
        el.style.transform = 'translateY(32px)';
        el.style.filter = 'blur(14px)';
      });
    }
  }

  function applyBannerLayout(animate) {
    const layout = getBannerLayoutParams();
    const slides = Array.from(document.querySelectorAll('#banner_track .banner_slide'));
    const contents = Array.from(document.querySelectorAll('#banner_content_track .banner_slide_overlay'));
    const total = slides.length;
    const duration = animate ? 1.1 : 0;

    slides.forEach((slide, i) => {
      const rel = getRelativeOffset(i, currentBannerIndex, total);
      const isActive = rel === 0;
      let xPercent = 0, scale = 1, opacity = 1, zIndex = 10;

      if (!isActive) {
        const dir = Math.sign(rel) || 1;
        if (Math.abs(rel) === 1) {
          xPercent = dir * layout.sideX; scale = layout.sideScale; opacity = layout.sideOpacity; zIndex = 5;
        } else {
          xPercent = dir * layout.farX; scale = layout.farScale; opacity = layout.farOpacity; zIndex = 1;
        }
      }

      slide.classList.toggle('is_active', isActive);

      if (window.gsap) {
        gsap.killTweensOf(slide);
        if (duration === 0) {
          gsap.set(slide, { xPercent, scale, opacity, zIndex });
        } else {
          gsap.set(slide, { zIndex });
          gsap.to(slide, { xPercent, scale, opacity, duration, ease: 'power3.inOut' });
        }
      } else {
        slide.style.zIndex = String(zIndex);
        slide.style.transition = animate
          ? 'transform 1.1s cubic-bezier(0.65, 0, 0.35, 1), opacity 1.1s ease'
          : 'none';
        slide.style.transform = `translateX(${xPercent}%) scale(${scale})`;
        slide.style.opacity = String(opacity);
      }
    });

    contents.forEach((content, i) => {
      const isActive = getRelativeOffset(i, currentBannerIndex, total) === 0;
      content.classList.toggle('is_active', isActive);
      if (isActive) animateBannerContentIn(content, animate);
      else resetBannerContent(content);
    });
  }

  function updateBannerDragPreview(deltaX) {
    if (!window.gsap) return;
    const slider = document.getElementById('banner_slider');
    if (!slider.clientWidth) return;

    const layout = getBannerLayoutParams();
    const progress = Math.max(-1, Math.min(1, deltaX / slider.clientWidth));
    const dir = progress < 0 ? 1 : -1; // dragging left reveals the "next" slide (rel === 1)
    const t = Math.abs(progress);

    const slides = Array.from(document.querySelectorAll('#banner_track .banner_slide'));
    const total = slides.length;

    slides.forEach((slide, i) => {
      const rel = getRelativeOffset(i, currentBannerIndex, total);
      if (rel !== 0 && rel !== dir) return;
      gsap.killTweensOf(slide);
      if (rel === 0) {
        gsap.set(slide, {
          xPercent: progress * 100,
          scale: 1 - t * (1 - layout.sideScale),
          opacity: 1 - t * (1 - layout.sideOpacity),
          zIndex: 10
        });
      } else {
        const fromX = rel * layout.sideX;
        gsap.set(slide, {
          xPercent: fromX + (0 - fromX) * t,
          scale: layout.sideScale + (1 - layout.sideScale) * t,
          opacity: layout.sideOpacity + (1 - layout.sideOpacity) * t,
          zIndex: 9
        });
      }
    });
  }

  function renderBanners(banners) {
    bannerItems = banners || [];
    const track = document.getElementById('banner_track');
    const contentTrack = document.getElementById('banner_content_track');
    const dotsWrap = document.getElementById('banner_dots');
    const previewTrack = document.getElementById('banner_preview_track');
    if (!track || !bannerItems.length) return;

    track.innerHTML = bannerItems.map((banner) => `
      <div class="banner_slide">
        <picture>
          <source media="(max-width: 767px)" srcset="${banner.imageMobile}">
          <img src="${banner.image}" alt="" draggable="false" />
        </picture>
      </div>
    `).join('');

    contentTrack.innerHTML = bannerItems.map((banner) => `
      <div class="banner_slide_overlay">
        <h2 class="banner_title">${escapeHtml(banner.title)}</h2>
        <p class="banner_desc">${escapeHtml(banner.description)}</p>
        <a class="banner_cta_btn" href="${banner.link}">
          <span>see now</span>
          <span class="banner_cta_icon" aria-hidden="true">→</span>
        </a>
      </div>
    `).join('');

    dotsWrap.innerHTML = bannerItems.map((banner, i) => `
      <button type="button" class="banner_dot${i === 0 ? ' is_active' : ''}"
        role="tab" aria-selected="${i === 0}" aria-label="${i + 1}번째 배너로 이동"
        data-index="${i}"></button>
    `).join('');

    dotsWrap.querySelectorAll('.banner_dot').forEach((dot) => {
      dot.addEventListener('click', () => goToBanner(Number(dot.dataset.index)));
    });

    previewTrack.innerHTML = bannerItems.map((banner, i) => `
      <button type="button" class="banner_preview_card${i === 0 ? ' is_active' : ''}"
        role="tab" aria-selected="${i === 0}" data-index="${i}">
        <span class="banner_preview_thumb"><img src="${banner.image}" alt="" /></span>
        <span class="banner_preview_info">
          <span class="banner_preview_title">${escapeHtml(banner.title)}</span>
          <span class="banner_preview_desc">${escapeHtml(banner.description)}</span>
        </span>
      </button>
    `).join('');

    previewTrack.querySelectorAll('.banner_preview_card').forEach((card) => {
      card.addEventListener('click', () => goToBanner(Number(card.dataset.index)));
    });

    document.getElementById('banner_prev_btn').addEventListener('click', () => goToBanner(currentBannerIndex - 1));
    document.getElementById('banner_next_btn').addEventListener('click', () => goToBanner(currentBannerIndex + 1));
    document.getElementById('banner_mini_prev_btn').addEventListener('click', () => goToBanner(currentBannerIndex - 1));
    document.getElementById('banner_mini_next_btn').addEventListener('click', () => goToBanner(currentBannerIndex + 1));

    initBannerDrag();
    goToBanner(0, true);
    startBannerAutoplay();

    let bannerResizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(bannerResizeTimer);
      bannerResizeTimer = setTimeout(() => applyBannerLayout(false), 150);
    });
  }

  function goToBanner(index, isInitial) {
    if (!bannerItems.length) return;
    currentBannerIndex = (index + bannerItems.length) % bannerItems.length;

    applyBannerLayout(!isInitial);

    document.querySelectorAll('.banner_dot').forEach((dot, i) => {
      const isActive = i === currentBannerIndex;
      dot.classList.toggle('is_active', isActive);
      dot.setAttribute('aria-selected', String(isActive));
    });

    const previewTrack = document.getElementById('banner_preview_track');
    previewTrack.querySelectorAll('.banner_preview_card').forEach((card, i) => {
      const isActive = i === currentBannerIndex;
      card.classList.toggle('is_active', isActive);
      card.setAttribute('aria-selected', String(isActive));
    });
    updateBannerPreviewPosition();

    if (!isInitial) restartBannerAutoplay();
  }

  function updateBannerPreviewPosition() {
    const previewTrack = document.getElementById('banner_preview_track');
    const previewCards = previewTrack.querySelectorAll('.banner_preview_card');
    const cardWidth = previewCards[0] ? previewCards[0].offsetWidth : 0;
    const gap = 32;
    previewTrack.style.transform = `translateX(-${currentBannerIndex * (cardWidth + gap)}px)`;
  }

  function startBannerAutoplay() {
    if (isReducedMotion() || bannerItems.length < 2) return;
    stopBannerAutoplay();
    bannerAutoplayTimer = setInterval(() => goToBanner(currentBannerIndex + 1, true), BANNER_AUTOPLAY_MS);
  }

  function stopBannerAutoplay() {
    if (bannerAutoplayTimer) clearInterval(bannerAutoplayTimer);
    bannerAutoplayTimer = null;
  }

  function restartBannerAutoplay() {
    stopBannerAutoplay();
    startBannerAutoplay();
  }

  function initBannerDrag() {
    const slider = document.getElementById('banner_slider');

    const handlePointerDown = (event) => {
      if (event.target.closest('button, a')) return;
      bannerDragState = { startX: event.clientX, deltaX: 0, pointerId: event.pointerId };
      stopBannerAutoplay();
      slider.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event) => {
      if (!bannerDragState) return;
      bannerDragState.deltaX = event.clientX - bannerDragState.startX;
      updateBannerDragPreview(bannerDragState.deltaX);
    };

    const handlePointerUp = () => {
      if (!bannerDragState) return;
      const deltaX = bannerDragState.deltaX;
      bannerDragState = null;
      if (Math.abs(deltaX) > DRAG_THRESHOLD_PX) {
        goToBanner(currentBannerIndex + (deltaX < 0 ? 1 : -1));
      } else {
        goToBanner(currentBannerIndex);
      }
      startBannerAutoplay();
    };

    slider.addEventListener('pointerdown', handlePointerDown);
    slider.addEventListener('pointermove', handlePointerMove);
    slider.addEventListener('pointerup', handlePointerUp);
    slider.addEventListener('pointercancel', handlePointerUp);
    slider.addEventListener('mouseenter', stopBannerAutoplay);
    slider.addEventListener('mouseleave', () => { if (!bannerDragState) startBannerAutoplay(); });
    slider.addEventListener('focusin', stopBannerAutoplay);
    slider.addEventListener('focusout', startBannerAutoplay);
  }

  /* ------------------------------------------------------------------ */
  /* Today's Exp map                                                     */
  /* ------------------------------------------------------------------ */

  let lastFocusedBeforePopover = null;
  let activeExpPin = null;

  function renderMapPins(regions) {
    const layer = document.getElementById('map_pin_layer');
    if (!layer || !regions) return;

    layer.innerHTML = regions.map((region) => `
      <button type="button" class="map_pin" data-region-id="${region.id}"
        data-label="${escapeHtml(region.name)}"
        style="left:${region.coords.x}%; top:${region.coords.y}%;"
        aria-label="${escapeHtml(region.name)} 지역 추천 콘텐츠 보기"></button>
    `).join('');

    layer.querySelectorAll('.map_pin').forEach((pin) => {
      pin.addEventListener('click', () => openExpPopover(pin.dataset.regionId, pin));
    });
  }

  function openExpPopover(regionId, triggerEl) {
    const region = natGeoData.todaysExp.find((r) => r.id === regionId);
    if (!region || !region.videos.length) return;
    const video = region.videos[0];

    lastFocusedBeforePopover = triggerEl || document.activeElement;
    activeExpPin = triggerEl || null;

    const popover = document.getElementById('exp_popover');
    document.getElementById('exp_popover_thumb_img').src = video.thumbnail;
    document.getElementById('exp_popover_title').textContent = video.title;
    document.getElementById('exp_popover_tag').textContent = video.category;
    document.getElementById('exp_popover_desc').textContent = video.description || '';

    popover.hidden = false;
    positionExpPopover(popover, triggerEl);
    requestAnimationFrame(() => popover.classList.add('is_open'));

    document.addEventListener('keydown', handlePopoverKeydown);
    document.addEventListener('pointerdown', handlePopoverOutsideClick);
  }

  function positionExpPopover(popover, pin) {
    const map = document.getElementById('todays_exp_map');
    if (!map || !pin) return;

    const mapRect = map.getBoundingClientRect();
    const pinRect = pin.getBoundingClientRect();
    const popoverWidth = popover.offsetWidth || 300;
    const popoverHeight = popover.offsetHeight || 320;
    const margin = 8;

    let left = (pinRect.left - mapRect.left) - popoverWidth * 0.15;
    let top = (pinRect.top - mapRect.top) + pinRect.height / 2 + 16;

    const maxLeft = Math.max(margin, mapRect.width - popoverWidth - margin);
    const maxTop = Math.max(margin, mapRect.height - popoverHeight - margin);
    left = Math.min(Math.max(margin, left), maxLeft);
    top = Math.min(Math.max(margin, top), maxTop);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function closeExpPopover() {
    const popover = document.getElementById('exp_popover');
    popover.classList.remove('is_open');
    popover.hidden = true;
    activeExpPin = null;
    document.removeEventListener('keydown', handlePopoverKeydown);
    document.removeEventListener('pointerdown', handlePopoverOutsideClick);
    if (lastFocusedBeforePopover) lastFocusedBeforePopover.focus();
  }

  function handlePopoverKeydown(event) {
    if (event.key === 'Escape') {
      closeExpPopover();
      return;
    }
    if (event.key !== 'Tab') return;

    const popover = document.getElementById('exp_popover');
    const focusable = popover.querySelectorAll('button, a[href]');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handlePopoverOutsideClick(event) {
    const popover = document.getElementById('exp_popover');
    if (popover.contains(event.target) || event.target.closest('.map_pin')) return;
    closeExpPopover();
  }

  /* ------------------------------------------------------------------ */
  /* Quiz                                                                 */
  /* ------------------------------------------------------------------ */

  const quizState = {
    questions: [],
    index: 0,
    selectedIndex: null,
    isAnswered: false,
    score: 0
  };

  function initQuiz(questions) {
    quizState.questions = questions || [];
    quizState.index = 0;
    quizState.selectedIndex = null;
    quizState.isAnswered = false;
    quizState.score = 0;
    renderQuizStep();
  }

  function renderQuizStep() {
    const container = document.getElementById('quiz_card');
    if (!container || !quizState.questions.length) return;
    const question = quizState.questions[quizState.index];
    const total = quizState.questions.length;
    const isLast = quizState.index === total - 1;

    container.innerHTML = `
      <p class="quiz_progress">${quizState.index + 1} / ${total}</p>
      <fieldset>
        <legend class="quiz_question">${escapeHtml(question.question)}</legend>
        <div class="quiz_choices" id="quiz_choices"></div>
      </fieldset>
      <div class="quiz_feedback" id="quiz_feedback" hidden></div>
      <div class="quiz_actions">
        <button type="button" class="btn_primary" id="quiz_check_btn" disabled>정답 확인</button>
        <button type="button" class="btn_ghost" id="quiz_next_btn" hidden>${isLast ? '결과 보기' : '다음 문제'}</button>
      </div>
    `;

    const choicesWrap = document.getElementById('quiz_choices');
    choicesWrap.innerHTML = question.choices.map((choice, i) => `
      <button type="button" class="quiz_choice_btn" data-index="${i}">${escapeHtml(choice)}</button>
    `).join('');

    choicesWrap.querySelectorAll('.quiz_choice_btn').forEach((btn) => {
      btn.addEventListener('click', () => handleChoiceSelect(Number(btn.dataset.index)));
    });

    document.getElementById('quiz_check_btn').addEventListener('click', handleCheckAnswer);
    document.getElementById('quiz_next_btn').addEventListener('click', handleNextQuestion);
  }

  function handleChoiceSelect(index) {
    if (quizState.isAnswered) return;
    quizState.selectedIndex = index;

    document.querySelectorAll('.quiz_choice_btn').forEach((btn, i) => {
      btn.classList.toggle('is_selected', i === index);
    });
    document.getElementById('quiz_check_btn').disabled = false;
  }

  function handleCheckAnswer() {
    const question = quizState.questions[quizState.index];
    if (quizState.selectedIndex === null || quizState.isAnswered) return;
    quizState.isAnswered = true;

    const isCorrect = quizState.selectedIndex === question.answerIndex;
    if (isCorrect) quizState.score += 1;

    document.querySelectorAll('.quiz_choice_btn').forEach((btn, i) => {
      btn.disabled = true;
      if (i === question.answerIndex) btn.classList.add('is_correct');
      if (i === quizState.selectedIndex && !isCorrect) btn.classList.add('has_error');
    });

    const feedback = document.getElementById('quiz_feedback');
    feedback.hidden = false;
    feedback.innerHTML = `<strong>${isCorrect ? '정답입니다!' : '아쉬워요!'}</strong> ${escapeHtml(question.explanation)}`;

    document.getElementById('quiz_check_btn').hidden = true;
    document.getElementById('quiz_next_btn').hidden = false;
  }

  function handleNextQuestion() {
    if (quizState.index + 1 < quizState.questions.length) {
      quizState.index += 1;
      quizState.selectedIndex = null;
      quizState.isAnswered = false;
      renderQuizStep();
    } else {
      renderQuizResult();
    }
  }

  function renderQuizResult() {
    const total = quizState.questions.length;
    saveQuizScore(quizState.score, total);

    const container = document.getElementById('quiz_card');
    container.innerHTML = `
      <p class="quiz_progress">퀴즈 완료</p>
      <p class="quiz_result_score">${quizState.score} / ${total}</p>
      <p class="quiz_feedback">지구와 자연에 대한 지식을 확인해봤어요.</p>
      <div class="quiz_actions">
        <button type="button" class="btn_primary" id="quiz_restart_btn">다시 풀기</button>
      </div>
    `;
    document.getElementById('quiz_restart_btn').addEventListener('click', () => {
      initQuiz(quizState.questions);
    });
  }

  function saveQuizScore(score, total) {
    try {
      localStorage.setItem(STORAGE_KEYS.QUIZ_SCORE, JSON.stringify({
        score, total, completedAt: new Date().toISOString()
      }));
    } catch (error) {
      /* localStorage unavailable: ignore silently */
    }
  }

  /* ------------------------------------------------------------------ */
  /* Magazine carousel                                                    */
  /* ------------------------------------------------------------------ */

  const magazineState = { items: [], activeIndex: 0 };
  let magazineMobileSwiper = null;
  const magazineMobileQuery = window.matchMedia('(max-width: 767px)');

  function initMagazineCarousel(items) {
    magazineState.items = items || [];
    magazineState.activeIndex = magazineState.items.length ? Math.min(2, magazineState.items.length - 1) : 0;
    renderMagazineCarousel();
    renderMagazineMobileSlides();
  }

  function magazineCardMarkup(item) {
    return `
      <div class="magazine_card_thumb"><img src="${item.thumbnail}" alt="" loading="lazy" /></div>
      <div class="magazine_card_info">
        <div class="magazine_card_info_top">
          <h3 class="magazine_card_title">${escapeHtml(item.title)}</h3>
          <div class="magazine_card_byline">
            <p>글 : ${escapeHtml(item.writer)}</p>
            <p>사진 : ${escapeHtml(item.photographer)}</p>
          </div>
        </div>
        <p class="magazine_card_desc">${escapeHtml(item.description)}</p>
        <p class="magazine_card_hashtags">${item.hashtags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>
      </div>
    `;
  }

  // Mobile-only Swiper "cards" effect stack — independent of the desktop coverflow's activeIndex/data-depth state.
  function renderMagazineMobileSlides() {
    const wrapper = document.getElementById('magazine_mobile_swiper_wrapper');
    if (!wrapper) return;

    destroyMagazineMobileSwiper();
    wrapper.innerHTML = magazineState.items.map((item) => `
      <div class="swiper-slide magazine_card">${magazineCardMarkup(item)}</div>
    `).join('');

    syncMagazineMobileSwiper();
  }

  function initMagazineMobileSwiper() {
    if (magazineMobileSwiper || typeof Swiper === 'undefined') return;
    const container = document.getElementById('magazine_mobile_swiper');
    if (!container || !magazineState.items.length) return;

    magazineMobileSwiper = new Swiper(container, {
      effect: 'cards',
      grabCursor: true,
      loop: magazineState.items.length > 2,
      cardsEffect: {
        slideShadows: false,
        perSlideOffset: 10,
        perSlideRotate: 3
      }
    });
  }

  function destroyMagazineMobileSwiper() {
    if (magazineMobileSwiper) {
      magazineMobileSwiper.destroy(true, true);
      magazineMobileSwiper = null;
    }
  }

  function syncMagazineMobileSwiper() {
    if (magazineMobileQuery.matches) initMagazineMobileSwiper();
    else destroyMagazineMobileSwiper();
  }

  magazineMobileQuery.addEventListener('change', syncMagazineMobileSwiper);

  function renderMagazineCarousel() {
    const container = document.getElementById('magazine_grid');
    if (!container) return;
    const items = magazineState.items;

    if (!items.length) {
      renderStateMessage(container, '해당하는 아티클이 없습니다.', false);
      return;
    }

    container.innerHTML = items.map((item, i) => {
      const depth = magazineState.activeIndex - i;
      const depthAttr = depth >= 0 && depth <= 2 ? ` data-depth="${depth}"` : '';
      return `<article class="magazine_card"${depthAttr}>${magazineCardMarkup(item)}</article>`;
    }).join('');

    const prevBtn = document.getElementById('magazine_prev_btn');
    const nextBtn = document.getElementById('magazine_next_btn');
    if (prevBtn) prevBtn.disabled = magazineState.activeIndex <= 0;
    if (nextBtn) nextBtn.disabled = magazineState.activeIndex >= items.length - 1;
  }

  function handleMagazinePrev() {
    if (magazineState.activeIndex <= 0) return;
    magazineState.activeIndex -= 1;
    renderMagazineCarousel();
  }

  function handleMagazineNext() {
    if (magazineState.activeIndex >= magazineState.items.length - 1) return;
    magazineState.activeIndex += 1;
    renderMagazineCarousel();
  }

  function handleBookmarkToggle(btn) {
    const isSelected = btn.classList.toggle('is_selected');
    btn.setAttribute('aria-pressed', String(isSelected));
  }

  /* ------------------------------------------------------------------ */
  /* Recommend accordion                                                 */
  /* ------------------------------------------------------------------ */

  const recommendState = { items: [], activeIndex: 0 };

  function generateStarRating(rating) {
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      const fillPercent = Math.max(0, Math.min(1, rating - i)) * 100;
      html += `<span class="recommend_star">★<span class="recommend_star_fill" style="width:${fillPercent}%">★</span></span>`;
    }
    return html;
  }

  function initRecommendAccordion(items) {
    recommendState.items = items || [];
    recommendState.activeIndex = recommendState.items.length ? recommendState.items.length - 1 : 0;
    renderRecommendAccordion();
  }

  function renderRecommendAccordion() {
    const container = document.getElementById('recommend_grid');
    if (!container) return;
    const items = recommendState.items;

    if (!items.length) {
      renderStateMessage(container, '해당하는 아티클이 없습니다.', false);
      return;
    }

    container.innerHTML = items.map((item, i) => {
      const isActive = i === recommendState.activeIndex;
      return `
        <div class="recommend_panel${isActive ? ' is_active' : ''}">
          <img class="recommend_panel_bg" src="${item.thumbnail}" alt="" />
          <div class="recommend_panel_scrim" aria-hidden="true"></div>
          <button type="button" class="recommend_panel_expand_btn" data-index="${i}" aria-expanded="${isActive}">
            <span class="recommend_panel_collapsed_title">${escapeHtml(item.title)}</span>
          </button>
          <div class="recommend_panel_info">
            <div class="recommend_panel_info_header">
              <h3 class="recommend_panel_title">${escapeHtml(item.title)}</h3>
              <button type="button" class="bookmark_btn" aria-pressed="false" data-id="${item.id}">
                ${BOOKMARK_SVG}
                <span class="sr_only">스크랩하기</span>
              </button>
            </div>
            <p class="recommend_panel_desc">${escapeHtml(item.description)}</p>
            <h4 class="recommend_panel_quote_label">전문가 한 줄평</h4>
            <p class="recommend_panel_quote">"${escapeHtml(item.expertQuote)}"</p>
            <div class="recommend_panel_rating" aria-label="평점 5점 만점에 ${item.rating}점">${generateStarRating(item.rating)}</div>
            <div class="recommend_panel_footer">
              <p class="recommend_panel_hashtags">${item.hashtags.map((tag) => `#${escapeHtml(tag)}`).join(' ')}</p>
              <a class="recommend_panel_more_btn" href="${item.moreLink}">more</a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.recommend_panel_expand_btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        recommendState.activeIndex = Number(btn.dataset.index);
        renderRecommendAccordion();
      });
    });

    container.querySelectorAll('.bookmark_btn').forEach((btn) => {
      btn.addEventListener('click', () => handleBookmarkToggle(btn));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Search                                                               */
  /* ------------------------------------------------------------------ */

  let recentSearches = [];

  function getRecentSearches() {
    return recentSearches;
  }

  function addRecentSearch(query) {
    recentSearches = [query, ...recentSearches.filter((item) => item !== query)].slice(0, RECENT_SEARCH_MAX);
  }

  function renderRecentSearches() {
    const list = document.getElementById('search_recent_list');
    if (!list) return;
    const recent = getRecentSearches();
    const terms = recent.length ? recent : DEFAULT_SEARCH_SUGGESTIONS;
    list.innerHTML = terms.map((term) => `
      <li><button type="button" data-term="${escapeHtml(term)}">${escapeHtml(term)}</button></li>
    `).join('');
    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('search_input').value = btn.dataset.term;
        runSearch(btn.dataset.term);
      });
    });
  }

  let lastFocusedBeforeSearch = null;

  function openSearch() {
    const panel = document.getElementById('search_panel');
    lastFocusedBeforeSearch = document.activeElement;
    panel.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('search_toggle_btn').setAttribute('aria-expanded', 'true');
    renderRecentSearches();
    // Start from the collapsed state, then let the next frame trigger the transition.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => panel.classList.add('is_open'));
    });
    document.getElementById('search_input').focus();
    document.addEventListener('keydown', handleSearchKeydown);
    document.addEventListener('click', handleSearchOutsideClick);
  }

  function handleSearchOutsideClick(event) {
    const panel = document.getElementById('search_panel');
    const toggleBtn = document.getElementById('search_toggle_btn');
    if (panel.contains(event.target) || toggleBtn.contains(event.target)) return;
    closeSearch();
  }

  function closeSearch() {
    const panel = document.getElementById('search_panel');
    panel.classList.remove('is_open');
    document.body.style.overflow = '';
    document.getElementById('search_toggle_btn').setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', handleSearchKeydown);
    document.removeEventListener('click', handleSearchOutsideClick);
    if (lastFocusedBeforeSearch) lastFocusedBeforeSearch.focus();

    const finishClose = (event) => {
      if (event && event.target !== panel) return;
      panel.hidden = true;
      panel.removeEventListener('transitionend', finishClose);
    };
    panel.addEventListener('transitionend', finishClose);
    window.setTimeout(finishClose, 400);
  }

  function handleSearchToggle() {
    const panel = document.getElementById('search_panel');
    if (panel.hidden) {
      openSearch();
    } else {
      closeSearch();
    }
  }

  function handleSearchKeydown(event) {
    if (event.key === 'Escape') {
      closeSearch();
      return;
    }
    if (event.key !== 'Tab') return;

    const panel = document.getElementById('search_panel');
    const focusable = panel.querySelectorAll('button:not([disabled]), a[href], input');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleSearchInputChange(event) {
    document.getElementById('search_submit_btn').disabled = event.target.value.trim().length === 0;
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    const query = document.getElementById('search_input').value.trim();
    if (!query) return;
    runSearch(query);
  }

  function runSearch(query) {
    if (!natGeoData) return;
    if (!query) {
      initMagazineCarousel(natGeoData.magazine);
      initRecommendAccordion(natGeoData.recommend);
      return;
    }

    addRecentSearch(query);
    closeSearch();

    const lowerQuery = query.toLowerCase();
    const matchItem = (item) => item.title.toLowerCase().includes(lowerQuery) || item.category.toLowerCase().includes(lowerQuery);
    const magazineMatches = natGeoData.magazine.filter(matchItem);
    const recommendMatches = natGeoData.recommend.filter(matchItem);

    if (!magazineMatches.length && !recommendMatches.length) {
      showToast('해당하는 아티클이 없습니다.');
      return;
    }

    initMagazineCarousel(magazineMatches);
    initRecommendAccordion(recommendMatches);
    document.getElementById('magazine').scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth' });
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                                */
  /* ------------------------------------------------------------------ */

  let toastTimer = null;

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, TOAST_DURATION_MS);
  }

  /* ------------------------------------------------------------------ */
  /* Header: mobile menu                                                 */
  /* ------------------------------------------------------------------ */

  function handleMenuToggle() {
    const menu = document.getElementById('mobile_menu');
    const btn = document.getElementById('menu_toggle_btn');
    const isOpen = menu.hidden;
    menu.hidden = !isOpen;
    btn.classList.toggle('is_active', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
  }

  /* ------------------------------------------------------------------ */
  /* Scroll: reveal + back-to-top                                        */
  /* ------------------------------------------------------------------ */

  function initScrollReveal() {
    const revealEls = document.querySelectorAll('.section');
    revealEls.forEach((el) => el.classList.add('reveal'));

    if (!('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('is_visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is_visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealEls.forEach((el) => observer.observe(el));
  }

  function initScrollTopButton() {
    const btn = document.getElementById('scroll_top_btn');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.hidden = window.scrollY < 400;
    });
    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: isReducedMotion() ? 'auto' : 'smooth' });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Brand typography hover glow                                         */
  /* ------------------------------------------------------------------ */

  function initBrandTypoGlow() {
    const wrap = document.getElementById('brand_typo_wrap');
    const glow = document.getElementById('brand_typo_glow');
    if (!wrap || !glow) return;

    let targetX = 50;
    let targetY = 50;
    let currentX = 50;
    let currentY = 50;
    let isAnimating = false;

    const updateSpot = () => {
      glow.style.setProperty('--spot-x', `${currentX}%`);
      glow.style.setProperty('--spot-y', `${currentY}%`);
    };

    const animate = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      updateSpot();
      if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
        requestAnimationFrame(animate);
      } else {
        isAnimating = false;
      }
    };

    const handlePointerMove = (event) => {
      const rect = wrap.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width) * 100;
      targetY = ((event.clientY - rect.top) / rect.height) * 100;

      if (isReducedMotion()) {
        currentX = targetX;
        currentY = targetY;
        updateSpot();
        return;
      }

      if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(animate);
      }
    };

    wrap.addEventListener('pointerenter', () => wrap.classList.add('is_hovering'));
    wrap.addEventListener('pointerleave', () => wrap.classList.remove('is_hovering'));
    wrap.addEventListener('pointermove', handlePointerMove);
  }

  /* ------------------------------------------------------------------ */
  /* Brand typography auto-fit (flush to both edges, never clips)        */
  /* ------------------------------------------------------------------ */

  // A vw-based font-size can only ever approximate the exact pixel width of "NATIONALGEOGRAPHIC",
  // so it has to leave a safety margin or risk overflow. Measuring the real rendered width and
  // solving for the font-size that makes it exactly match the container is the only way to get
  // a flush, edge-to-edge fit that's still guaranteed not to clip.
  function fitBrandTypo() {
    const wrap = document.getElementById('brand_typo_wrap');
    if (!wrap) return;
    const sample = wrap.querySelector('.brand_typo_base');
    const allText = wrap.querySelectorAll('.brand_typo');
    if (!sample || !allText.length) return;

    const referenceSize = 100;
    sample.style.fontSize = `${referenceSize}px`;
    // `.brand_typo` is CSS `width:100%`, so getBoundingClientRect() would just report the box's
    // forced width regardless of the actual glyph width. scrollWidth still reports the true
    // (possibly overflowing, since white-space:nowrap) content width, which is what we need here.
    const naturalWidth = sample.scrollWidth;
    const containerWidth = wrap.getBoundingClientRect().width;
    if (!naturalWidth || !containerWidth) return;

    const fitSize = (containerWidth / naturalWidth) * referenceSize;
    allText.forEach((el) => { el.style.fontSize = `${fitSize}px`; });
  }

  function initBrandTypoFit() {
    if (!document.getElementById('brand_typo_wrap')) return;
    fitBrandTypo();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(fitBrandTypo);
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitBrandTypo, 150);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mouse follower glow (desktop pointer devices only)                   */
  /* ------------------------------------------------------------------ */

  function initMouseGlow() {
    const glow = document.getElementById('mouse_glow');
    if (!glow) return;

    const desktopQuery = window.matchMedia('(min-width: 1280px) and (hover: hover) and (pointer: fine)');
    const hasGsap = typeof window.gsap !== 'undefined';

    let active = false;
    let rafId = null;
    let moveX = null;
    let moveY = null;
    let lastHitTarget = null;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;

    // Treat anything with an image/video surface (incl. CSS background-image cards) as "media" for the brighter screen-blend state.
    const isMediaElement = (el) => {
      let node = el;
      for (let depth = 0; node instanceof Element && depth < 4; depth += 1) {
        if (node.tagName === 'IMG' || node.tagName === 'VIDEO' || node.tagName === 'PICTURE') return true;
        const bg = window.getComputedStyle(node).backgroundImage;
        if (bg && bg !== 'none') return true;
        node = node.parentElement;
      }
      return false;
    };

    function tick() {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      glow.style.transform = `translate(${currentX}px, ${currentY}px) translate(-50%, -50%)`;
      if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    }

    function handleMove(event) {
      glow.classList.add('is_active');
      if (event.target !== lastHitTarget) {
        lastHitTarget = event.target;
        glow.classList.toggle('is_over_media', isMediaElement(event.target));
      }

      if (hasGsap) {
        moveX(event.clientX);
        moveY(event.clientY);
      } else {
        targetX = event.clientX;
        targetY = event.clientY;
        if (!rafId) rafId = requestAnimationFrame(tick);
      }
    }

    function enable() {
      if (active || isReducedMotion()) return;
      active = true;
      if (hasGsap) {
        gsap.set(glow, { xPercent: -50, yPercent: -50, x: window.innerWidth / 2, y: window.innerHeight / 2 });
        moveX = gsap.quickTo(glow, 'x', { duration: 0.6, ease: 'power3' });
        moveY = gsap.quickTo(glow, 'y', { duration: 0.6, ease: 'power3' });
      }
      document.addEventListener('pointermove', handleMove);
    }

    function disable() {
      active = false;
      glow.classList.remove('is_active', 'is_over_media');
      document.removeEventListener('pointermove', handleMove);
      if (hasGsap) gsap.killTweensOf(glow);
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      moveX = null;
      moveY = null;
    }

    const syncWithQuery = () => (desktopQuery.matches ? enable() : disable());
    desktopQuery.addEventListener('change', syncWithQuery);
    syncWithQuery();
  }

  /* ------------------------------------------------------------------ */
  /* Bootstrap                                                            */
  /* ------------------------------------------------------------------ */

  function addClickListener(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addClickListener('search_toggle_btn', handleSearchToggle);
    addClickListener('search_close_btn', closeSearch);
    addClickListener('menu_toggle_btn', handleMenuToggle);
    addClickListener('exp_popover_close_btn', closeExpPopover);
    addClickListener('magazine_prev_btn', handleMagazinePrev);
    addClickListener('magazine_next_btn', handleMagazineNext);

    const searchForm = document.getElementById('search_form');
    if (searchForm) searchForm.addEventListener('submit', handleSearchSubmit);

    const searchInput = document.getElementById('search_input');
    if (searchInput) searchInput.addEventListener('input', handleSearchInputChange);

    initScrollTopButton();
    initBrandTypoGlow();
    initBrandTypoFit();
    initMouseGlow();
    initApp();

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateBannerPreviewPosition();
        const popover = document.getElementById('exp_popover');
        if (popover && !popover.hidden && activeExpPin) positionExpPopover(popover, activeExpPin);
      }, 150);
    });
  });
})();
