// ═══════════════════════════════════════════════════════════════════════════════
// ГОЛОВНИЙ СКРИПТ РОЗКЛАДУ КАФЕДРИ МІТ
// ═══════════════════════════════════════════════════════════════════════════════


        // Кастомний alert/confirm
        let customAlertResolve = null;
        
        function customAlert(message, title = 'Повідомлення', type = 'info') {
            return new Promise((resolve) => {
                customAlertResolve = resolve;
                
                // Іконки та кольори для різних типів
                const icons = {
                    'info': '<i class="fa-solid fa-circle-info" style="color: #3b82f6;"></i>',
                    'success': '<i class="fa-solid fa-circle-check" style="color: #22c55e;"></i>',
                    'warning': '<i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b;"></i>',
                    'error': '<i class="fa-solid fa-circle-xmark" style="color: #ef4444;"></i>'
                };
                
                document.getElementById('customAlertIcon').innerHTML = icons[type] || icons['info'];
                document.getElementById('customAlertTitle').textContent = title;
                document.getElementById('customAlertMessage').textContent = message;
                document.getElementById('customAlertActions').innerHTML = '<button class="btn btn-primary" onclick="closeCustomAlert(true)" style="min-width: 100px;">OK</button>';
                document.getElementById('customAlertModal').classList.add('open');
            });
        }
        
        function customConfirm(message, title = 'Підтвердження', okText = 'OK', cancelText = 'Скасувати') {
            return new Promise((resolve) => {
                customAlertResolve = resolve;

                // Іконка питання для confirm
                document.getElementById('customAlertIcon').innerHTML = '<i class="fa-solid fa-circle-question" style="color: #f59e0b;"></i>';
                document.getElementById('customAlertTitle').textContent = title;
                document.getElementById('customAlertMessage').textContent = message;
                document.getElementById('customAlertActions').innerHTML = `<button class="btn btn-secondary" onclick="closeCustomAlert(false)" style="min-width: 100px;">${cancelText}</button><button class="btn btn-primary" onclick="closeCustomAlert(true)" style="min-width: 100px;">${okText}</button>`;
                document.getElementById('customAlertModal').classList.add('open');
            });
        }
        
        function closeCustomAlert(result) {
            document.getElementById('customAlertModal').classList.remove('open');
            if (customAlertResolve) {
                customAlertResolve(result);
                customAlertResolve = null;
            }
        }

        // Різні часові слоти для різних днів тижня (1=Пн, 2=Вт, 3=Ср, 4=Чт, 5=Пт)

        let currentWeek = 1;
        let actualCurrentWeek = 1; // Реальний поточний тиждень з бекенду
        let semesterStartDate = null; // Дата початку семестру для обчислення тижня
        let liveLessons = [];
        let draftLessons = null;
        let lessons = []; 
        let tempLiveLessons = []; 
        let processedIds = new Set();
        let processedRequests = []; // Зберігаємо затверджені та відхилені requests
        let teachersList = []; let subjectsList = []; let groupsList = []; let roomsList = [];
        
        let isAdmin = false;
        let isCompareMode = false;
        let actionState = { active: false, type: null, sourceId: null };
        let highlightState = { active: false };
        let editState = { isNew: true, lessonId: null, day: null, slot: null };
        let autoSaveTimer = null;
        let unsavedChanges = false;
        
        // Мульти-вибір для пропозицій (Teacher/Guest mode)
        let multiChoiceState = { active: false, sourceLesson: null, targets: [] };
        let pendingProposals = []; // Зберігаємо pending proposals для візуалізації
        
        // Заявки для адміна
        let teacherRequests = []; // PENDING requests from teachers

        // Dark Mode
        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
            updateDarkModeIcon();
        }
        
        function updateDarkModeIcon() {
            const btn = document.getElementById('darkModeToggle');
            if (!btn) return;
            const icon = btn.querySelector('i');
            if (document.body.classList.contains('dark-mode')) {
                icon.className = 'fa-solid fa-sun';
                btn.title = 'Світла тема';
            } else {
                icon.className = 'fa-solid fa-moon';
                btn.title = 'Темна тема';
            }
        }
        
        function initDarkMode() {
            const darkMode = localStorage.getItem('darkMode');
            if (darkMode === 'enabled') {
                document.body.classList.add('dark-mode');
            }
            updateDarkModeIcon();
        }
        
        // Функції для розумних кнопок
        function updateButtonStates() {
            const hasChanges = hasUnsavedChanges();
            
            // Перевіряємо чи є мульти-вибір з варіантами
            const hasMultiChoice = multiChoiceState.active && 
                                   multiChoiceState.sourceLesson && 
                                   multiChoiceState.targets.length > 0;
            
            // Кнопка "Узгодити зміни" (гість) - активна якщо є зміни АБО мульти-вибір
            const proposeBtn = document.getElementById('proposeBtnGuest');
            if (proposeBtn) {
                if (hasChanges || hasMultiChoice) {
                    proposeBtn.classList.add('has-changes');
                    proposeBtn.classList.remove('no-changes');
                    proposeBtn.disabled = false;
                    proposeBtn.removeAttribute('data-tooltip');
                    proposeBtn.removeAttribute('title');
                } else {
                    proposeBtn.classList.remove('has-changes');
                    proposeBtn.classList.add('no-changes');
                    proposeBtn.disabled = true;
                    proposeBtn.setAttribute('data-tooltip', 'Немає змін для відправки');
                    proposeBtn.removeAttribute('title');
                }
            }
            
            // Кнопка "Зберегти" (адмін)
            const saveBtn = document.getElementById('saveBtnAdmin');
            if (saveBtn) {
                if (hasChanges) {
                    saveBtn.classList.add('has-changes');
                    saveBtn.classList.remove('no-changes');
                    saveBtn.disabled = false;
                    saveBtn.removeAttribute('data-tooltip');
                    saveBtn.removeAttribute('title');
                } else {
                    saveBtn.classList.remove('has-changes');
                    saveBtn.classList.add('no-changes');
                    saveBtn.disabled = true;
                    saveBtn.setAttribute('data-tooltip', 'Немає змін для збереження');
                    saveBtn.removeAttribute('title');
                }
            }
        }
        
        function hasUnsavedChanges() {
            if (!liveLessons || !lessons) return false;
            if (lessons.length !== liveLessons.length) return true;
            
            for (let i = 0; i < lessons.length; i++) {
                const current = lessons[i];
                const live = liveLessons.find(l => l.id === current.id);
                
                if (!live) return true;
                
                const fields = ['group', 'subject', 'teacher', 'teacher2', 'type', 'room', 'day', 'slot', 'week', 'note'];
                for (const field of fields) {
                    if (String(current[field] || '') !== String(live[field] || '')) {
                        return true;
                    }
                }
            }
            
            return false;
        }
        
        async function init() {
            // Показуємо плавний лоадер під час початкового завантаження
            showGlobalLoader('Завантаження довідників…');

            // Ініціалізація Dark Mode
            initDarkMode();
            
            // Перевірка readonly режиму для викладачів
            const urlParams = new URLSearchParams(window.location.search);
            const isReadOnly = urlParams.get('view') === 'readonly' || urlParams.has('teacher') || urlParams.has('group');
            
            if(isReadOnly) {
                // Приховуємо ТІЛЬКИ кнопку "Вхід" для викладачів
                // Викладачі можуть пропонувати зміни через кнопку "Узгодити зміни"
                const loginBtn = document.getElementById('loginBtn');
                if(loginBtn) {
                    loginBtn.style.display = 'none';
                }
                // Зберігаємо в sessionStorage що це readonly режим
                sessionStorage.setItem('readonlyMode', 'true');
            }
            
            if(localStorage.getItem('isAdmin') === 'true') setAdminMode(true);
            loadFromLocal();
            
            // Завантажуємо pending proposals
            pendingProposals = loadPendingProposals();
            
            renderGrid();
            renderLessons();
            updateWeekWatermark();
            updateWeekWatermarkParallax();
            checkConflicts();
            updateLiveStatus();
            setInterval(updateLiveStatus, 30000);
            window.addEventListener('scroll', updateWeekWatermarkParallax, { passive: true });

            // Початкове завантаження даних з Google (аналогічно rozklad_kaf16.html)
            try {
                await loadFromGoogle({ showLoader: false, skipUnsavedConfirm: true });
            } finally {
                // Ховаємо глобальний лоадер після повного першого завантаження
                hideGlobalLoader();
            }
            
            // Автоперевірка нових draft запитів для адміна (кожні 10 секунд)
            setInterval(() => {
                if (isAdmin && !isCompareMode) {
                    checkForNewDraft();
                }
            }, 10000);
            
            window.addEventListener('beforeunload', function (e) { if (unsavedChanges) { e.preventDefault(); e.returnValue = ''; } });
            document.addEventListener('dragend', () => { document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('drag-over')); });
            fixTooltips();

            // Мобільні жесті та нижня навігація для тижнів
            initMobileWeekNav();
            initSwipeGestures();
        }

        function initMobileWeekNav() {
            const btn1m = document.getElementById('btn-week-1-mobile');
            const btn2m = document.getElementById('btn-week-2-mobile');
            if (!btn1m || !btn2m) return;

            // Синхронізуємо початковий стан
            if (currentWeek === 1) {
                btn1m.classList.add('active');
                btn2m.classList.remove('active');
            } else {
                btn2m.classList.add('active');
                btn1m.classList.remove('active');
            }
        }

        let swipeStartX = null;
        let swipeStartY = null;
        let swipeStartTime = null;
        let weekWatermarkBaseScroll = null;

        function initSwipeGestures() {
            const container = document.getElementById('schedule-container');
            if (!container) return;

            // Тільки на мобільних екранах
            const isSmallScreen = () => window.innerWidth <= 768;

            container.addEventListener('touchstart', (e) => {
                if (!isSmallScreen() || e.touches.length !== 1) return;
                const t = e.touches[0];
                swipeStartX = t.clientX;
                swipeStartY = t.clientY;
                swipeStartTime = Date.now();
            }, { passive: true });

            container.addEventListener('touchend', (e) => {
                if (!isSmallScreen() || swipeStartX === null || swipeStartY === null || swipeStartTime === null) return;

                const t = e.changedTouches[0];
                const dx = t.clientX - swipeStartX;
                const dy = t.clientY - swipeStartY;
                const dt = Date.now() - swipeStartTime;

                swipeStartX = swipeStartY = swipeStartTime = null;

                // Мінімальна відстань та швидкість жесту
                if (Math.abs(dx) < 40) return;
                if (Math.abs(dx) < Math.abs(dy) * 1.5) return; // уникати вертикального скролу
                if (dt > 600) return;

                // Ліворуч: наступний тиждень, праворуч: попередній тиждень
                const scheduleEl = document.getElementById('schedule-container');

                if (dx < 0 && currentWeek === 1) {
                    // Свайп вліво → рух контенту зправа наліво
                    if (scheduleEl) {
                        scheduleEl.classList.remove('week-swipe-left', 'week-swipe-right');
                        void scheduleEl.offsetWidth;
                        scheduleEl.classList.add('week-swipe-left');
                    }
                    setWeek(2);
                } else if (dx > 0 && currentWeek === 2) {
                    // Свайп вправо → рух контенту зліва направо
                    if (scheduleEl) {
                        scheduleEl.classList.remove('week-swipe-left', 'week-swipe-right');
                        void scheduleEl.offsetWidth;
                        scheduleEl.classList.add('week-swipe-right');
                    }
                    setWeek(1);
                }
            }, { passive: true });
        }

        function updateWeekWatermarkParallax() {
            const wm = document.getElementById('week-watermark');
            if (!wm) return;
            
            // Водяний знак завжди фіксовано по центру екрана
            wm.style.transform = 'translate(-50%, -50%)';
        }
        
        // Перевірка нових draft без перезавантаження всього
        async function checkForNewDraft() {
            try {
                const response = await fetch(GOOGLE_SCRIPT_URL);
                const data = await response.json();
                
                if (data.result === 'success' && data.draft) {
                    const newDraft = sanitizeData(data.draft.lessons);
                    
                    // Порівнюємо з поточним draft
                    const currentDraftStr = JSON.stringify(draftLessons || []);
                    const newDraftStr = JSON.stringify(newDraft);
                    
                    if (currentDraftStr !== newDraftStr) {
                        // Є нові зміни - оновлюємо
                        draftLessons = newDraft;
                        updateDraftAlert();
                        
                        // Оновлюємо візуалізацію якщо в режимі порівняння
                        if (isCompareMode) {
                            renderLessons();
                        }
                        
                        console.log('[AUTO CHECK] Знайдено нові draft зміни');
                    }
                }
            } catch (e) {
                // Тихо ігноруємо помилки автоперевірки
                console.log('[AUTO CHECK] Помилка:', e.message);
            }
        }

        function fixTooltips() {
            // Знаходимо всі елементи з title
            document.querySelectorAll('[title]').forEach(el => {
                // Переносимо текст у наш спеціальний атрибут
                el.setAttribute('data-tooltip', el.getAttribute('title'));
                // Видаляємо стандартну страшну підказку
                el.removeAttribute('title');
            });
        }
        
        function sanitizeData(data) {
            if (!Array.isArray(data)) return [];
            return data
                .map(item => {
                    const normalized = {};
                    for (const key in item) {
                        normalized[key.toLowerCase()] = item[key];
                    }
                    return normalized;
                })
                .filter(l => l && l.id)
                .map(l => ({
                    ...l,
                    week: parseInt(l.week) || 1,
                    day: parseInt(l.day) || 1,
                    slot: parseInt(l.slot) || 1,
                    note: l.note || '',
                    teacher2: l.teacher2 || '',
                    // Зберігаємо _deleted якщо є
                    ...(l._deleted ? { _deleted: true } : {})
                }));
        }

        function showLogin() {
            // Блокуємо вхід в readonly режимі
            if(sessionStorage.getItem('readonlyMode') === 'true') {
                return;
            }
            const m = document.getElementById('loginModal'); const i = document.getElementById('adminPass'); 
            m.classList.add('open'); i.value=''; i.focus(); 
            i.onkeydown = (e) => { if(e.key==='Enter') processLogin(); if(e.key==='Escape') closeLoginModal(); }; 
        }
        function closeLoginModal() { document.getElementById('loginModal').classList.remove('open'); document.getElementById('adminPass').value=''; }
        function processLogin() {
            const pass = document.getElementById('adminPass').value;
            if(pass === ADMIN_PASSWORD) {
                setAdminMode(true);
                closeLoginModal();
                reloadAll();
            } else { customAlert('Невірний пароль', 'Помилка', 'error'); document.getElementById('adminPass').value=''; }
        }
    
    
        async function logout() {
        // Якщо є незбережені зміни - питаємо
        if (unsavedChanges) {
            const shouldSave = await customConfirm(
                '⚠️ Є незбережені зміни!\n\nЗберегти перед виходом?',
                'Попередження',
                'Зберегти',      // Текст кнопки OK
                'Скасувати'      // Текст кнопки Cancel
            );

            if (shouldSave) {
                // Зберігаємо БЕЗ додаткового підтвердження
                await sendData('admin_save', { lessons: lessons });
                customAlert('Збережено!', 'Успішно', 'success');
                unsavedChanges = false;
                // Після збереження - виходимо
            } else {
                // Натиснув "Скасувати" - залишаємося в адмінці
                return;
            }
        }

        // Виходимо
        setAdminMode(false);
        exitCompare();
        reloadAll();
    }



    // ===================================================================
    // ДОДАТКОВО: Захист при закритті вкладки браузера
    // ===================================================================

       window.addEventListener('beforeunload', (e) => {
        // Якщо є незбережені зміни - показуємо попередження браузера
        if (unsavedChanges) {
            e.preventDefault();
            e.returnValue = ''; // Сучасні браузери ігнорують текст, показують стандартне повідомлення
            return '';
        }
    });
        
        function setAdminMode(val) {
            // Блокуємо встановлення адмін режиму в readonly
            if(sessionStorage.getItem('readonlyMode') === 'true' && val === true) {
                return;
            }
            isAdmin = val;
            localStorage.setItem('isAdmin', val);
            document.body.classList.toggle('is-admin', val);
            const badge = document.getElementById('role-badge');
            badge.className = val ? 'status-badge st-admin' : 'status-badge st-guest';
            badge.innerHTML = val ? '<i class="fa-solid fa-user-shield"></i> Адмін' : '<i class="fa-solid fa-user"></i> Гість';
            updateDraftAlert();
        }
        
        function checkRealDifferences() {
            if (!draftLessons || draftLessons.length === 0) return false;
            if (liveLessons.length !== draftLessons.length) return true;
            const liveMap = new Map(liveLessons.map(l => [String(l.id), l]));
            const draftMap = new Map(draftLessons.map(l => [String(l.id), l]));
            for (let [id, draftL] of draftMap) {
                const liveL = liveMap.get(id);
                if (!liveL) return true;
                if (JSON.stringify(liveL) !== JSON.stringify(draftL)) return true;
            }
            for (let [id, liveL] of liveMap) {
                if (!draftMap.has(id)) return true;
            }
            return false;
        }
        
        function countDraftChanges() {
            if (!draftLessons || draftLessons.length === 0) return { total: 0, added: 0, removed: 0, modified: 0 };
            
            const liveMap = new Map(liveLessons.map(l => [String(l.id), l]));
            const draftMap = new Map(draftLessons.map(l => [String(l.id), l]));
            
            let added = 0;
            let removed = 0;
            let modified = 0;
            
            // Обробляємо всі пари з draft
            for (let [id, draftL] of draftMap) {
                // ВАЖЛИВО: Пропускаємо вже оброблені зміни
                if (processedIds.has(id)) {
                    console.log('[COUNT] Skipping processed ID:', id);
                    continue;
                }
                
                const liveL = liveMap.get(id);
                
                // ВАЖЛИВО: Рахуємо тільки для поточного тижня
                let weekToCheck = currentWeek;
                if (draftL._deleted && liveL) {
                    // Для видалених пар перевіряємо week з live
                    weekToCheck = parseInt(liveL.week);
                } else if (draftL.week !== undefined) {
                    // Для інших - з draft
                    weekToCheck = parseInt(draftL.week);
                }
                
                if (weekToCheck !== parseInt(currentWeek)) {
                    console.log('[COUNT] Skipping different week:', id, 'week:', weekToCheck, 'current:', currentWeek);
                    continue;
                }
                
                // Перевіряємо чи є маркер _deleted
                if (draftL._deleted) {
                    // Пара позначена як видалена
                    removed++;
                }
                else if (!liveL) {
                    // Пара є в draft але немає в live = додана
                    added++;
                } 
                else {
                    // Обидві є - порівнюємо (виключаючи _deleted з порівняння)
                    const liveClean = { ...liveL };
                    const draftClean = { ...draftL };
                    delete draftClean._deleted; // На всяк випадок
                    
                    if (JSON.stringify(liveClean) !== JSON.stringify(draftClean)) {
                        modified++;
                    }
                    // Якщо ідентичні - не рахуємо (це context)
                }
            }
            
            const total = added + removed + modified;
            
            console.log('[COUNT] Draft changes for week', currentWeek, ':', { total, added, removed, modified });
            console.log('[COUNT] Processed IDs excluded:', Array.from(processedIds));
            
            return { total, added, removed, modified };
        }

        function updateDraftAlert() {
            const draftAlert = document.getElementById('draft-alert');
            const statsInline = document.getElementById('draft-stats-inline');
            
            // Перевіряємо чи є draft зміни або teacher requests
            const hasDraftChanges = checkRealDifferences();
            const hasRequests = teacherRequests && teacherRequests.length > 0;
            
            if (isAdmin && (hasDraftChanges || hasRequests)) {
                let statsHtml = '';
                
                // Рахуємо всі зміни разом
                const changes = hasDraftChanges ? countDraftChanges() : { total: 0, added: 0, removed: 0, modified: 0 };
                
                // Додаємо teacher requests до modified (переміщення)
                const totalModified = changes.modified + (hasRequests ? teacherRequests.length : 0);
                
                if (changes.added > 0) {
                    statsHtml += `<span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:8px; display:flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-plus" style="font-size:9px;"></i> ${changes.added}
                    </span>`;
                }
                
                if (totalModified > 0) {
                    statsHtml += `<span style="background:#fed7aa; color:#c2410c; padding:2px 8px; border-radius:8px; display:flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-arrows-up-down-left-right" style="font-size:9px;"></i> ${totalModified}
                    </span>`;
                }
                
                if (changes.removed > 0) {
                    statsHtml += `<span style="background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:8px; display:flex; align-items:center; gap:4px;">
                        <i class="fa-solid fa-trash" style="font-size:9px;"></i> ${changes.removed}
                    </span>`;
                }
                
                statsInline.innerHTML = statsHtml;
                draftAlert.style.display = 'flex';
                
                // Pulse анімація при нових змінах
                draftAlert.classList.remove('pulse-glow');
                void draftAlert.offsetWidth;
                draftAlert.classList.add('pulse-glow');
            } else {
                draftAlert.style.display = 'none';
            }
        }

        function loadFromLocal() {
            const data = localStorage.getItem('uni_schedule_data');
            if (data) liveLessons = sanitizeData(JSON.parse(data));
            else liveLessons = [{ id: 'l1', group: 'Приклад', subject: 'Введіть дані', type: 'Лекція', teacher: '', room: '', day: 1, slot: 1, week: 1 }];
            
            lessons = JSON.parse(JSON.stringify(liveLessons));

            const tData = localStorage.getItem('uni_teachers_list'); if(tData) teachersList = JSON.parse(tData);
            const sData = localStorage.getItem('uni_subjects_list'); if(sData) subjectsList = JSON.parse(sData);
            const gData = localStorage.getItem('uni_groups_list'); if(gData) groupsList = JSON.parse(gData);
            const rData = localStorage.getItem('uni_rooms_list'); if(rData) roomsList = JSON.parse(rData);
            
            // Якщо списків немає в localStorage, генеруємо їх з наявних занять
            if (!teachersList || teachersList.length === 0) {
                teachersList = [...new Set(liveLessons.map(l => l.teacher).filter(t => t))];
            }
            if (!subjectsList || subjectsList.length === 0) {
                subjectsList = [...new Set(liveLessons.map(l => l.subject).filter(s => s))];
            }
            if (!groupsList || groupsList.length === 0) {
                groupsList = [...new Set(liveLessons.map(l => l.group).filter(g => g))];
            }
            if (!roomsList || roomsList.length === 0) {
                roomsList = [...new Set(liveLessons.map(l => l.room).filter(r => r && typeof r === 'string' && !r.startsWith('Аудиторія ')))];
            }
            
            populateDatalists();
        }

        // Глобальний лоадер (прогрес-бар + скелетон) - копія з rozklad_kaf16.html
        let globalLoaderCounter = 0;
        function showGlobalLoader(message) {
            const loader = document.getElementById('global-loader');
            if (!loader) return;
            const subtitleEl = document.getElementById('global-loader-subtitle');
            if (subtitleEl && message) {
                subtitleEl.textContent = message;
            }
            globalLoaderCounter++;
            loader.classList.remove('hidden');
            document.body.classList.add('loading');
        }
        function hideGlobalLoader() {
            const loader = document.getElementById('global-loader');
            if (!loader) return;
            if (globalLoaderCounter > 0) globalLoaderCounter--;
            if (globalLoaderCounter <= 0) {
                globalLoaderCounter = 0;
                loader.classList.add('hidden');
                document.body.classList.remove('loading');
            }
        }

        async function loadFromGoogle(options = {}) {
            const { showLoader = false, skipUnsavedConfirm = false } = options || {};
            
            if (unsavedChanges && !skipUnsavedConfirm && !(await customConfirm("Незбережені локальні зміни будуть втрачені. Оновити?"))) return;
            
            if (showLoader) {
                showGlobalLoader('Оновлення даних розкладу…');
            }

            updateCloudStatus('pending', 'Перевірка...');
            try {
                const response = await fetch(GOOGLE_SCRIPT_URL);
                
                // Перевіряємо статус відповіді
                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error('Google Apps Script не знайдено. Перевірте URL в налаштуваннях.');
                    }
                    throw new Error(`Помилка сервера: ${response.status}`);
                }
                
                // Перевіряємо чи це JSON
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('Сервер повернув неправильний формат відповіді. Перевірте URL Google Apps Script.');
                }
                
                const data = await response.json();
                if (data.result === 'error') throw new Error(data.error);
                
                liveLessons = sanitizeData(data.live?.lessons || []);
                let rawDraft = data.draft ? sanitizeData(data.draft.lessons) : [];
                draftLessons = (rawDraft.length > 0) ? rawDraft : null;
                
                // Завантажуємо заявки від викладачів
                teacherRequests = data.requests || [];
                
                // Отримуємо поточний тиждень з бекенду
                if (data.currentWeek) {
                    actualCurrentWeek = data.currentWeek;
                    currentWeek = data.currentWeek;
                    
                    // Визначаємо який день тижня сьогодні
                    const now = new Date();
                    const dayOfWeek = now.getDay(); // 0 = неділя, 6 = субота
                    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                    
                    if (isWeekend) {
                        console.log('[INFO] Weekend! Current week:', currentWeek, '→ Will show as "Next week" with opposite number');
                    } else {
                        console.log('[INFO] Weekday. Current week:', currentWeek);
                    }
                    
                    // Встановлюємо тиждень в UI
                    setTimeout(() => setWeek(currentWeek), 0);
                    
                    // Оновлюємо індикатор (у вихідні показуємо наступний тиждень)
                    updateCurrentWeekIndicator(isWeekend);
                }
                
                // Зберігаємо дату початку семестру
                if (data.semesterStartDate) {
                    semesterStartDate = new Date(data.semesterStartDate);
                    console.log('[INFO] Semester start date:', semesterStartDate);
                }
                
                // Очищаємо pending proposals які вже оброблені (не існують на сервері)
                if (!isAdmin) {
                    const pending = loadPendingProposals();
                    if (pending.length > 0) {
                        const serverRequestIds = new Set(teacherRequests.map(r => r.id));
                        const stillPending = pending.filter(p => serverRequestIds.has(p.requestId));
                        
                        if (stillPending.length !== pending.length) {
                            localStorage.setItem('pendingProposals', JSON.stringify(stillPending));
                            console.log('[CLEANUP] Removed', pending.length - stillPending.length, 'old pending proposals');
                        }
                    }
                }
                
                if(data.live?.teachers) teachersList = data.live.teachers;
                if(data.live?.subjects) subjectsList = data.live.subjects;
                if(data.live?.groups) groupsList = data.live.groups;
                if(data.live?.rooms) roomsList = data.live.rooms;
                
                // Якщо сервер не надав списки, генеруємо їх з наявних занять
                if (!teachersList || teachersList.length === 0) {
                    teachersList = [...new Set(liveLessons.map(l => l.teacher).filter(t => t))];
                }
                if (!subjectsList || subjectsList.length === 0) {
                    subjectsList = [...new Set(liveLessons.map(l => l.subject).filter(s => s))];
                }
                if (!groupsList || groupsList.length === 0) {
                    groupsList = [...new Set(liveLessons.map(l => l.group).filter(g => g))];
                }
                if (!roomsList || roomsList.length === 0) {
                    roomsList = [...new Set(liveLessons.map(l => l.room).filter(r => r && typeof r === 'string' && !r.startsWith('Аудиторія ')))];
                }

                localStorage.setItem('uni_teachers_list', JSON.stringify(teachersList));
                localStorage.setItem('uni_groups_list', JSON.stringify(groupsList));
                localStorage.setItem('uni_subjects_list', JSON.stringify(subjectsList));
                localStorage.setItem('uni_rooms_list', JSON.stringify(roomsList));

                if (!isCompareMode) {
                    lessons = JSON.parse(JSON.stringify(liveLessons));
                }
                
                unsavedChanges = false;
                saveToLocal(); 
                populateDatalists(); 
                renderLessons(); 
                checkConflicts(); 
                updateDraftAlert();
                checkUrlParams();

                updateCloudStatus('saved', 'Оновлено');
                updateButtonStates();
            } catch (e) {
                console.error(e);
                updateCloudStatus('error', 'Помилка оновлення');
            } finally {
                if (showLoader) {
                    hideGlobalLoader();
                }
            }
        }

        function reloadAll() { loadFromGoogle({ showLoader: true }); }

        function triggerAutoSave() { 
            unsavedChanges = true; 
            saveToLocal(); 
            updateCloudStatus('pending', 'Локальні зміни...'); 
            updateButtonStates();
        }
        function manualSave() { adminSave(); }
        
        function saveToLocal() {
            localStorage.setItem('uni_schedule_data', JSON.stringify(liveLessons)); 
        }

        // ═══════════════════════════════════════════════════════════════════
        // МУЛЬТИ-ВИБІР ПРОПОЗИЦІЙ (Teacher/Guest mode)
        // ═══════════════════════════════════════════════════════════════════
        
        function toggleMultiChoiceMode() {
            if (isAdmin) return; // Тільки для гостей
            
            multiChoiceState.active = !multiChoiceState.active;
            
            if (multiChoiceState.active) {
                multiChoiceState.sourceLesson = null;
                multiChoiceState.targets = [];
                document.body.classList.add('multi-choice-active');
                document.getElementById('multiChoiceBtn').style.display = 'none';
                document.getElementById('multiChoiceCancelBtn').style.display = 'inline-flex';
            } else {
                document.body.classList.remove('multi-choice-active');
                document.getElementById('multiChoiceBtn').style.display = 'inline-flex';
                document.getElementById('multiChoiceCancelBtn').style.display = 'none';
                
                // Очищаємо підсвічування слотів
                document.querySelectorAll('.time-slot').forEach(slot => {
                    slot.classList.remove('move-available', 'move-conflict', 'choice-target', 'priority-1', 'priority-2', 'priority-3');
                    slot.removeAttribute('data-priority');
                });
            }
            
            renderLessons();
            updateButtonStates(); // Оновлюємо стан кнопки
        }
        
        function handleSlotClickMultiChoice(day, slot, event) {
            if (!multiChoiceState.active || isAdmin) return false;
            
            event.stopPropagation();
            const slotEl = event.target.closest('.time-slot');
            if (!slotEl) return true;
            
            // Перевіряємо чи клікнули безпосередньо на картку пари
            const clickedCard = event.target.closest('.lesson-card');
            
            // Якщо клікнули на картку пари
            if (clickedCard) {
                const lessonId = clickedCard.id;
                const lesson = lessons.find(l => l.id === lessonId);
                
                if (!lesson) return true;
                
                if (multiChoiceState.sourceLesson && multiChoiceState.sourceLesson.id === lessonId) {
                    // Скасувати вибір (клікнули на ту саму обрану пару)
                    multiChoiceState.sourceLesson = null;
                    multiChoiceState.targets = [];
                } else if (multiChoiceState.sourceLesson) {
                    // Вже обрано іншу пару - показуємо помилку
                    customAlert('Ви вже обрали пару для переносу! Щоб змінити вибір, спочатку клікніть на обрану пару щоб скасувати вибір.', 'Увага', 'warning');
                    return true;
                } else {
                    // Обрати цю пару як джерело (поки що нічого не обрано)
                    multiChoiceState.sourceLesson = lesson;
                    multiChoiceState.targets = [];
                }
                
                renderLessons();
                highlightSlotsForMultiChoice(); // Підсвічуємо слоти ПІСЛЯ рендеру
                updateMultiChoiceFab();
                updateButtonStates();
                return true;
            }
            
            // Якщо клікнули на порожню частину слоту (не на картку)
            if (!multiChoiceState.sourceLesson) {
                customAlert('Спочатку оберіть пару, яку хочете перенести!', 'Увага', 'warning');
                return true;
            }
            
            // Перевіряємо конфлікти для цього слоту
            const hasConflict = checkDuplicationConflict(multiChoiceState.sourceLesson, currentWeek, day, slot);
            
            if (hasConflict) {
                const conflictMessages = {
                    'group': `⚠️ Конфлікт: Група ${hasConflict.lesson.group} вже має пару в цей час!\n\n${hasConflict.lesson.subject} (${hasConflict.lesson.teacher})`,
                    'teacher': `⚠️ Конфлікт: Викладач ${hasConflict.lesson.teacher} вже зайнятий в цей час!\n\n${hasConflict.lesson.subject} (${hasConflict.lesson.group})`,
                    'room': `⚠️ Конфлікт: Аудиторія ${hasConflict.lesson.room} вже зайнята в цей час!\n\n${hasConflict.lesson.subject} (${hasConflict.lesson.teacher})`
                };
                
                customAlert(conflictMessages[hasConflict.type], 'Конфлікт', 'warning');
                return true;
            }
            
            // Перевіряємо чи вже обрано цей слот
            const existingIdx = multiChoiceState.targets.findIndex(t => t.day === day && t.slot === slot);
            
            if (existingIdx >= 0) {
                // Видалити з варіантів
                multiChoiceState.targets.splice(existingIdx, 1);
            } else {
                // Додати варіант (максимум 3)
                if (multiChoiceState.targets.length >= 3) {
                    customAlert('Максимум 3 варіанти для переносу!', 'Обмеження', 'warning');
                    return true;
                }
                multiChoiceState.targets.push({ day, slot });
            }
            
            renderLessons();
            highlightSlotsForMultiChoice(); // Підсвічуємо слоти ПІСЛЯ рендеру
            updateMultiChoiceFab();
            updateButtonStates();
            return true;
        }
        
        function highlightSlotsForMultiChoice() {
            if (!multiChoiceState.active || !multiChoiceState.sourceLesson) return;
            
            // Очищаємо попередні підсвічування
            document.querySelectorAll('.time-slot').forEach(slot => {
                slot.classList.remove('move-available', 'move-conflict');
            });
            
            // Підсвічуємо всі слоти
            document.querySelectorAll('.time-slot').forEach(slot => {
                const day = parseInt(slot.dataset.day);
                const slotNum = parseInt(slot.dataset.slot);
                
                // Перевіряємо конфлікти
                const hasConflict = checkDuplicationConflict(multiChoiceState.sourceLesson, currentWeek, day, slotNum);
                
                if (hasConflict) {
                    slot.classList.add('move-conflict');
                } else {
                    slot.classList.add('move-available');
                }
            });
            
            // Позначаємо обрані target slots
            multiChoiceState.targets.forEach((target, index) => {
                const targetSlot = document.querySelector(`.time-slot[data-day="${target.day}"][data-slot="${target.slot}"]`);
                if (targetSlot) {
                    targetSlot.classList.add('choice-target');
                    targetSlot.classList.add(`priority-${Math.min(index + 1, 3)}`);
                    targetSlot.setAttribute('data-priority', index + 1);
                    // Видаляємо класи конфлікту з обраних слотів
                    targetSlot.classList.remove('move-conflict', 'move-available');
                }
            });
        }
        
        function updateMultiChoiceFab() {
            // Нічого не робимо - FAB видалено, використовуємо основну кнопку
        }
        
        function savePendingProposalToLocal(requestId, proposal) {
            let pending = JSON.parse(localStorage.getItem('pendingProposals') || '[]');
            pending.push({
                requestId,
                lessonId: proposal.lessonId,
                timestamp: new Date().toISOString(),
                ...proposal
            });
            localStorage.setItem('pendingProposals', JSON.stringify(pending));
        }
        
        function loadPendingProposals() {
            return JSON.parse(localStorage.getItem('pendingProposals') || '[]');
        }
        
        function removePendingProposal(requestId) {
            let pending = loadPendingProposals();
            pending = pending.filter(p => p.requestId !== requestId);
            localStorage.setItem('pendingProposals', JSON.stringify(pending));
        }
        
        function cleanupOldPendingProposals(activeRequestIds) {
            // Видаляємо pending proposals для яких requests вже не існують
            let pending = loadPendingProposals();
            const cleaned = pending.filter(p => activeRequestIds.includes(p.requestId));
            
            if (cleaned.length !== pending.length) {
                localStorage.setItem('pendingProposals', JSON.stringify(cleaned));
                console.log('[CLEANUP] Removed', pending.length - cleaned.length, 'old pending proposals');
            }
        }
        
        async function proposeChanges() {
            // Перевіряємо чи є будь-які зміни
            const hasMultiChoice = multiChoiceState.active && multiChoiceState.sourceLesson && multiChoiceState.targets.length > 0;
            const hasRegularChanges = hasUnsavedChanges();
            
            if (!hasMultiChoice && !hasRegularChanges) {
                return; // Немає жодних змін
            }
            
            // Формуємо повідомлення про зміни
            let confirmMessage = '';
            if (hasMultiChoice && hasRegularChanges) {
                // Обидва типи змін
                const changes = calculateChanges(liveLessons, lessons);
                const added = changes.added.length;
                const modified = changes.modified.length;
                const removed = changes.removed.length;
                const variantCount = multiChoiceState.targets.length;
                const variantWord = variantCount === 1 ? 'варіант' : (variantCount < 5 ? 'варіанти' : 'варіантів');
                confirmMessage = `Узгодити зміни?\n\n` +
                    `• Перенесення пари "${multiChoiceState.sourceLesson.subject}" на ${variantCount} ${variantWord}\n` +
                    `• Інші зміни: додано ${added}, змінено ${modified}, видалено ${removed}`;
            } else if (hasMultiChoice) {
                // Тільки мульти-вибір
                const variantCount = multiChoiceState.targets.length;
                const variantWord = variantCount === 1 ? 'варіант' : (variantCount < 5 ? 'варіанти' : 'варіантів');
                confirmMessage = `Узгодити перенесення пари "${multiChoiceState.sourceLesson.subject}" на ${variantCount} ${variantWord}?`;
            } else {
                // Тільки звичайні зміни - детальний розбір
                const changes = calculateChanges(liveLessons, lessons);
                const added = changes.added.length;
                const modified = changes.modified.length;
                const removed = changes.removed.length;
                
                // Формуємо детальне повідомлення
                if (added === 1 && modified === 0 && removed === 0) {
                    confirmMessage = `Узгодити додавання пари "${changes.added[0].subject}"?`;
                } else if (added === 0 && modified === 1 && removed === 0) {
                    // Перевіряємо чи це перенесення чи редагування
                    const modifiedLesson = changes.modified[0];
                    const originalLesson = liveLessons.find(l => String(l.id) === String(modifiedLesson.id));
                    
                    // Якщо змінились тільки day/slot/week - це перенесення
                    const isMove = originalLesson && 
                        (originalLesson.day !== modifiedLesson.day || 
                         originalLesson.slot !== modifiedLesson.slot || 
                         originalLesson.week !== modifiedLesson.week) &&
                        originalLesson.subject === modifiedLesson.subject &&
                        originalLesson.teacher === modifiedLesson.teacher &&
                        originalLesson.type === modifiedLesson.type &&
                        originalLesson.group === modifiedLesson.group &&
                        originalLesson.room === modifiedLesson.room;
                    
                    if (isMove) {
                        confirmMessage = `Узгодити перенесення пари "${modifiedLesson.subject}"?`;
                    } else {
                        confirmMessage = `Узгодити зміни в парі "${modifiedLesson.subject}"?`;
                    }
                } else if (added === 0 && modified === 0 && removed === 1) {
                    const removedLesson = liveLessons.find(l => String(l.id) === String(changes.removed[0].id));
                    confirmMessage = `Узгодити видалення пари "${removedLesson ? removedLesson.subject : '(пара)'}"?`;
                } else {
                    // Кілька змін
                    confirmMessage = `Узгодити зміни?\n\nДодано: ${added}, змінено: ${modified}, видалено: ${removed}`;
                }
            }
            
            if (!(await customConfirm(confirmMessage))) {
                return;
            }
            
            let multiProposal = null;
            let regularDraft = null;
            
            // 1. Готуємо мульти-пропозицію (якщо є)
            if (hasMultiChoice) {
                multiProposal = {
                    lessonId: multiChoiceState.sourceLesson.id,
                    teacher: multiChoiceState.sourceLesson.teacher,
                    subject: multiChoiceState.sourceLesson.subject,
                    group: multiChoiceState.sourceLesson.group,
                    original: {
                        day: multiChoiceState.sourceLesson.day,
                        slot: multiChoiceState.sourceLesson.slot,
                        week: multiChoiceState.sourceLesson.week
                    },
                    variants: multiChoiceState.targets.map((t, i) => ({
                        day: t.day,
                        slot: t.slot,
                        week: currentWeek,
                        priority: i + 1
                    }))
                };
            }
            
            // 2. Готуємо звичайні зміни (якщо є)
            if (hasRegularChanges) {
                // Обчислюємо що саме змінилось відносно liveLessons
                const changes = calculateChanges(liveLessons, lessons);
                
                console.log('[GUEST PROPOSE] Changes to send:', changes);
                console.log('[GUEST PROPOSE] Added:', changes.added.length);
                console.log('[GUEST PROPOSE] Modified:', changes.modified.length);
                console.log('[GUEST PROPOSE] Removed:', changes.removed.length);
                
                // Створюємо draft який містить всі змінені/додані пари + маркери видалених
                regularDraft = [
                    ...changes.added,      // Нові пари
                    ...changes.modified,   // Змінені пари
                    ...changes.removed     // Видалені пари з маркером _deleted
                ];
                
                console.log('[GUEST PROPOSE] Draft to send count:', regularDraft.length);
            }
            
            // 3. Відправляємо всі зміни
            updateCloudStatus('pending', 'Відправка...');
            
            try {
                // Спочатку відправляємо мульти-пропозицію (якщо є)
                if (multiProposal) {
                    const response = await fetch(GOOGLE_SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify({ action: 'propose', data: multiProposal })
                    });
                    
                    const result = await response.json();
                    
                    if (result.result === 'success') {
                        savePendingProposalToLocal(result.requestId, multiProposal);
                        console.log('[MULTI-CHOICE] Request created:', result.requestId);
                    } else {
                        throw new Error(result.error || 'Помилка відправки мульти-пропозиції');
                    }
                }
                
                // Потім відправляємо звичайні зміни (якщо є)
                if (regularDraft && regularDraft.length > 0) {
                    await sendData('propose_draft', { 
                        lessons: regularDraft
                    });
                    console.log('[GUEST PROPOSE] Draft sent:', regularDraft.length, 'changes');
                }
                
                updateCloudStatus('saved', 'Надіслано!');
                
                // Рахуємо загальну кількість змін
                let totalChanges = 0;
                if (multiProposal) totalChanges += 1; // Мульти-вибір = 1 зміна (переміщення)
                if (regularDraft) totalChanges += regularDraft.length;
                
                const message = totalChanges === 1 
                    ? 'Пропозицію надіслано!' 
                    : `Надіслано ${totalChanges} пропозиції`;
                
                customAlert(message, 'Успішно', 'success');
                
                // Виходимо з режиму мульти-вибору
                if (multiChoiceState.active) {
                    toggleMultiChoiceMode();
                }
                
                unsavedChanges = false;
                reloadAll();
                
            } catch (error) {
                console.error('[PROPOSE CHANGES]', error);
                updateCloudStatus('error', 'Помилка');
                customAlert('Помилка: ' + error.message, 'Помилка', 'error');
            }
        }
        
        function calculateChanges(live, current) {
            const liveMap = new Map(live.map(l => [String(l.id), l]));
            const currentMap = new Map(current.map(l => [String(l.id), l]));
            
            const added = [];
            const modified = [];
            const removed = [];
            
            // Знаходимо додані та змінені
            for (let [id, currentLesson] of currentMap) {
                const liveLesson = liveMap.get(id);
                if (!liveLesson) {
                    // Нова пара
                    console.log('[CALCULATE CHANGES] ADDED lesson:', currentLesson);
                    added.push(currentLesson);
                } else if (JSON.stringify(liveLesson) !== JSON.stringify(currentLesson)) {
                    // Змінена пара
                    modified.push(currentLesson);
                }
            }
            
            // Знаходимо видалені
            for (let [id, liveLesson] of liveMap) {
                if (!currentMap.has(id)) {
                    // Пара була видалена
                    removed.push({ id: id, _deleted: true });
                }
            }
            
            return { added, modified, removed };
        }

        async function adminSave() {
            // Перевіряємо чи є зміни
            if (!hasUnsavedChanges()) {
                return; // Тихо виходимо, бо кнопка disabled
            }

            if(!(await customConfirm("Зберегти зміни у розклад?", "Підтвердження", "Зберегти", "Скасувати"))) return;
            await sendData('admin_save', { lessons: lessons });
            customAlert('Збережено!', 'Успішно', 'success');
            unsavedChanges = false;
            reloadAll();
        }

        async function saveMergedChanges() {
            if(!(await customConfirm("Зберегти оброблені зміни?"))) return;
            
            console.log('[SAVE MERGED] === ПОЧАТОК ЗБЕРЕЖЕННЯ ===');
            console.log('[SAVE MERGED] liveLessons count:', liveLessons.length);
            console.log('[SAVE MERGED] tempLiveLessons count:', tempLiveLessons.length);
            console.log('[SAVE MERGED] processedIds:', Array.from(processedIds));
            console.log('[SAVE MERGED] processedRequests:', processedRequests);
            
            try {
                // 1. Спочатку обробляємо requests (якщо є)
                if (processedRequests.length > 0) {
                    for (const req of processedRequests) {
                        try {
                            if (req.action === 'approve') {
                                await fetch(GOOGLE_SCRIPT_URL, {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        action: 'approve_request',
                                        requestId: req.requestId,
                                        selectedVariant: req.selectedVariant
                                    })
                                });
                                console.log('[APPROVE REQUEST] OK:', req.requestId);
                                // Видаляємо pending індикатор для затвердженої заявки
                                removePendingProposal(req.requestId);
                            } else if (req.action === 'reject') {
                                await fetch(GOOGLE_SCRIPT_URL, {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        action: 'reject_request',
                                        requestId: req.requestId
                                    })
                                });
                                console.log('[REJECT REQUEST] OK:', req.requestId);
                                // Видаляємо pending індикатор для відхиленої заявки
                                removePendingProposal(req.requestId);
                            }
                        } catch (error) {
                            console.error('[PROCESS REQUEST] error:', error);
                        }
                    }
                }
                
                // 1.5. Оновлюємо requests з частково відхиленими варіантами
                // Знаходимо всі requests які мають reject_variant
                const requestsToUpdate = new Map();
                
                for (const pr of processedRequests) {
                    if (pr.action === 'reject_variant') {
                        if (!requestsToUpdate.has(pr.requestId)) {
                            requestsToUpdate.set(pr.requestId, []);
                        }
                        requestsToUpdate.get(pr.requestId).push(pr.variantData);
                    }
                }
                
                // Для кожного request з відхиленими варіантами - відправляємо оновлені варіанти
                for (const [requestId, rejectedVariants] of requestsToUpdate) {
                    const request = teacherRequests.find(r => r.id === requestId);
                    if (request && request.variants && request.variants.length > 0) {
                        try {
                            await fetch(GOOGLE_SCRIPT_URL, {
                                method: 'POST',
                                body: JSON.stringify({
                                    action: 'update_request',
                                    requestId: requestId,
                                    variants: request.variants // Відправляємо оновлений список варіантів
                                })
                            });
                            console.log('[UPDATE REQUEST] OK:', requestId, 'variants:', request.variants.length);
                        } catch (error) {
                            console.error('[UPDATE REQUEST] error:', error);
                        }
                    }
                }
                
                // 2. Зберігаємо оновлений розклад з tempLiveLessons
                const finalLessons = JSON.parse(JSON.stringify(tempLiveLessons));
                console.log('[SAVE MERGED] Saving lessons count:', finalLessons.length);
                
                await sendData('admin_save', {
                    lessons: finalLessons
                });
                
                // 3. Обробляємо draft - залишаємо тільки необроблені зміни
                let remainingDraft = [];
                
                if (draftLessons && draftLessons.length > 0) {
                    // Фільтруємо draft - залишаємо тільки ті зміни, які НЕ були оброблені
                    remainingDraft = draftLessons.filter(draftLesson => {
                        const id = String(draftLesson.id);
                        const wasProcessed = processedIds.has(id);
                        
                        if (wasProcessed) {
                            console.log('[SAVE MERGED] Видаляємо оброблену зміну з draft:', id);
                            return false; // Не зберігаємо оброблені
                        } else {
                            console.log('[SAVE MERGED] Залишаємо необроблену зміну в draft:', id);
                            return true; // Зберігаємо необроблені
                        }
                    });
                    
                    console.log('[SAVE MERGED] Remaining draft count:', remainingDraft.length);
                }
                
                // 4. Оновлюємо draft на сервері
                // Видаляємо контекстні пари (які ідентичні finalLessons) з remainingDraft
                const finalLessonsMap = new Map(finalLessons.map(l => [String(l.id), l]));
                const realChanges = remainingDraft.filter(draftLesson => {
                    const id = String(draftLesson.id);
                    const finalLesson = finalLessonsMap.get(id);
                    
                    // Якщо пара видалена і її немає в finalLessons - вже оброблена, не залишаємо
                    if (draftLesson._deleted && !finalLesson) return false;
                    
                    // Якщо пара видалена і є в finalLessons - не оброблена, залишаємо
                    if (draftLesson._deleted && finalLesson) return true;
                    
                    // Якщо немає в finalLessons - додана пара, реальна зміна
                    if (!finalLesson) return true;
                    
                    // Порівнюємо чи є відмінності з finalLessons
                    const draftClean = { ...draftLesson };
                    delete draftClean._deleted;
                    return JSON.stringify(finalLesson) !== JSON.stringify(draftClean);
                });
                
                console.log('[SAVE MERGED] Real changes after filtering context:', realChanges.length);
                
                // ВАЖЛИВО: Спочатку очищаємо draft повністю, потім зберігаємо тільки realChanges
                await sendData('clear_draft', {});
                console.log('[SAVE MERGED] Draft очищено');
                
                if (realChanges.length > 0) {
                    // Якщо є необроблені зміни - зберігаємо їх
                    await sendData('propose_draft', {
                        lessons: realChanges
                    });
                    console.log('[SAVE MERGED] Draft оновлено з необробленими змінами');
                }
                
                // 5. Оновлюємо teacherRequests - видаляємо повністю відхилені/затверджені, залишаємо часткові
                const updatedRequests = [];
                for (const request of teacherRequests) {
                    // Перевіряємо чи був цей request повністю оброблений
                    const fullReject = processedRequests.find(pr => 
                        pr.requestId === request.id && pr.action === 'reject'
                    );
                    const fullApprove = processedRequests.find(pr => 
                        pr.requestId === request.id && pr.action === 'approve'
                    );
                    
                    if (fullReject || fullApprove) {
                        // Повністю оброблений - не додаємо до updatedRequests
                        console.log('[SAVE MERGED] Видаляємо повністю оброблений request:', request.id);
                        continue;
                    }
                    
                    // Перевіряємо чи були відхилені окремі варіанти
                    const rejectedVariantsData = processedRequests
                        .filter(pr => pr.requestId === request.id && pr.action === 'reject_variant')
                        .map(pr => pr.variantData);
                    
                    if (rejectedVariantsData.length > 0) {
                        // Залишаємо тільки не відхилені варіанти (порівнюємо по даним)
                        const remainingVariants = request.variants.filter(v => {
                            // Перевіряємо чи цей варіант НЕ в списку відхилених
                            return !rejectedVariantsData.some(rejected => 
                                rejected.day === v.day && 
                                rejected.slot === v.slot && 
                                rejected.week === v.week && 
                                rejected.priority === v.priority
                            );
                        });
                        
                        if (remainingVariants.length > 0) {
                            updatedRequests.push({
                                ...request,
                                variants: remainingVariants
                            });
                            console.log('[SAVE MERGED] Залишаємо request з варіантами:', request.id, 'variants:', remainingVariants.length);
                        }
                    } else {
                        // Не оброблений взагалі - залишаємо як є
                        updatedRequests.push(request);
                        console.log('[SAVE MERGED] Залишаємо необроблений request:', request.id);
                    }
                }
                
                // 6. Зберігаємо оновлені teacherRequests на сервер
                if (updatedRequests.length > 0) {
                    // Є необроблені requests - зберігаємо їх
                    await sendData('update_requests', {
                        requests: updatedRequests
                    });
                    console.log('[SAVE MERGED] Requests оновлено, залишилось:', updatedRequests.length);
                } else {
                    // Всі requests оброблені - можна очистити (або залишити порожній масив)
                    console.log('[SAVE MERGED] Всі requests оброблені');
                }
                
                // 7. Оновлюємо локальний стан
                liveLessons = JSON.parse(JSON.stringify(finalLessons));
                lessons = JSON.parse(JSON.stringify(finalLessons));
                draftLessons = realChanges.length > 0 ? realChanges : null;
                teacherRequests = updatedRequests;
                processedRequests = [];
                processedIds = new Set();
                
                console.log('[SAVE MERGED] Локальний стан оновлено');
                console.log('[SAVE MERGED] Залишилось draft змін:', draftLessons ? draftLessons.length : 0);
                console.log('[SAVE MERGED] Залишилось requests:', teacherRequests.length);
                console.log('[SAVE MERGED] Залишилось teacher requests:', teacherRequests.length);
                
                // 8. Закриваємо режим порівняння
                exitCompare();
                
                // 9. Оновлюємо інтерфейс
                updateDraftAlert();
                updateButtonStates();
                renderLessons();
                
                // 10. Показуємо повідомлення
                const totalRemaining = realChanges.length + teacherRequests.length;
                const message = totalRemaining > 0 
                    ? `Оброблені зміни збережено! Залишилось необроблених: ${totalRemaining}`
                    : 'Всі зміни успішно оброблено та збережено!';
                customAlert(message, 'Успішно', 'success');
                
                console.log('[SAVE MERGED] === ЗБЕРЕЖЕННЯ ЗАВЕРШЕНО ===');
                
            } catch (error) {
                console.error('[SAVE MERGED] Помилка:', error);
                customAlert('Помилка при збереженні: ' + error.message, 'Помилка', 'error');
            }
        }

        function getDiffIds(liveArr, draftArr) {
            const diffs = new Set();
            const liveMap = new Map(liveArr.map(l => [String(l.id), l]));
            const draftMap = new Map(draftArr.map(l => [String(l.id), l]));
            
            for (let [id, d] of draftMap) {
                const l = liveMap.get(id);
                if (!l || JSON.stringify(l) !== JSON.stringify(d)) diffs.add(id);
            }
            for (let [id, l] of liveMap) {
                if (!draftMap.has(id)) diffs.add(id);
            }
            return diffs;
        }

        async function rejectDraft() {
            if(!(await customConfirm("Відхилити ВСІ пропозиції та очистити чернетку?"))) return;
            await sendData('reject', {});
            exitCompare();
            reloadAll();
        }

        async function sendData(action, payload) {
            console.log('[SEND DATA] action:', action);
            console.log('[SEND DATA] payload:', payload);
            
            updateCloudStatus('pending', 'Відправка...');
            try {
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: action, data: payload })
                });
                const res = await response.json();
                console.log('[SEND DATA] response:', res);
                
                if(res.result === 'error') throw new Error(res.error);
                updateCloudStatus('saved', 'Виконано');
            } catch(e) {
                console.error('[SEND DATA] error:', e);
                updateCloudStatus('error', 'Помилка');
                customAlert("Помилка: " + e.message, "Помилка", "error");
            }
        }

        function startCompare() {
            // Перевіряємо чи є draft зміни або teacher requests
            const hasDraft = draftLessons && draftLessons.length > 0;
            const hasRequests = teacherRequests && teacherRequests.length > 0;
            
            if (!hasDraft && !hasRequests) {
                customAlert('Немає пропозицій для порівняння', 'Інформація', 'info');
                return;
            }
            
            isCompareMode = true;
            processedIds = new Set();
            processedRequests = []; // Очищаємо оброблені requests
            document.getElementById('compare-panel').classList.add('show');
            
            // Ініціалізуємо tempLiveLessons як копію liveLessons
            // Draft зміни будуть показані як diff, а застосовуватися тільки після Accept
            tempLiveLessons = JSON.parse(JSON.stringify(liveLessons));
            
            renderLessons(true); 
        }
        
        async function approveRequest(requestId, variantIndex) {
            const req = teacherRequests.find(r => r.id === requestId);
            if (!req || !req.variants || !req.variants[variantIndex]) {
                customAlert('Заявку не знайдено', 'Помилка', 'error');
                return;
            }
            
            const selectedVariant = req.variants[variantIndex];
            const originalLesson = liveLessons.find(l => String(l.id) === String(req.lesson_id));
            
            if (!originalLesson) {
                customAlert('Пару не знайдено в розкладі', 'Помилка', 'error');
                return;
            }
            
            // Запитуємо підтвердження
            const dayName = DAY_NAMES[selectedVariant.day] || `День ${selectedVariant.day}`;
            const variantInfo = `${dayName}, ${selectedVariant.slot} пара`;
            const confirmMsg = `Затвердити варіант ${selectedVariant.priority}?\n\n${req.info || 'Заявка'}\nВикладач: ${req.teacher}\n${variantInfo}`;
            
            if (!(await customConfirm(confirmMsg))) {
                return;
            }
            
            // Локально переміщуємо пару в tempLiveLessons
            const lessonIndex = tempLiveLessons.findIndex(l => String(l.id) === String(originalLesson.id));
            
            if (lessonIndex >= 0) {
                // Оновлюємо позицію пари
                tempLiveLessons[lessonIndex] = {
                    ...tempLiveLessons[lessonIndex],
                    day: selectedVariant.day,
                    slot: selectedVariant.slot,
                    week: selectedVariant.week || tempLiveLessons[lessonIndex].week
                };
                
                // Позначаємо як оброблену
                processedIds.add(String(originalLesson.id));
                
                // Зберігаємо інформацію про затверджений request
                processedRequests.push({
                    action: 'approve',
                    requestId: requestId,
                    selectedVariant: {
                        day: selectedVariant.day,
                        slot: selectedVariant.slot,
                        week: selectedVariant.week,
                        priority: selectedVariant.priority
                    }
                });
                
                // Видаляємо цей request з teacherRequests локально
                const reqIndex = teacherRequests.findIndex(r => r.id === requestId);
                if (reqIndex >= 0) {
                    teacherRequests.splice(reqIndex, 1);
                }
                
                // Видаляємо pending індикатор (пісочний годинник)
                removePendingProposal(requestId);
                
                // Оновлюємо відображення
                renderLessons(true);
                updateDraftAlert(); // Оновлюємо лічильник
            }
        }
        
        async function rejectRequest(requestId, event) {
            if (event) {
                event.stopPropagation(); // Зупиняємо propagation щоб не спрацював клік на картці
            }
            
            const req = teacherRequests.find(r => r.id === requestId);
            if (!req) {
                customAlert('Заявку не знайдено', 'Помилка', 'error');
                return;
            }
            
            if (!(await customConfirm(`Відхилити всю заявку від ${req.teacher}?\n\n${req.info || ''}`))) {
                return;
            }
            
            // Зберігаємо інформацію про відхилений request
            processedRequests.push({
                action: 'reject',
                requestId: requestId
            });
            
            // Видаляємо request локально
            const reqIndex = teacherRequests.findIndex(r => r.id === requestId);
            if (reqIndex >= 0) {
                teacherRequests.splice(reqIndex, 1);
            }
            
            // Видаляємо pending індикатор (пісочний годинник)
            removePendingProposal(requestId);
            
            // Оновлюємо відображення
            renderLessons(true);
            updateDraftAlert(); // Оновлюємо лічильник
        }
        
        async function rejectRequestVariant(requestId, variantIndex, event) {
            if (event) {
                event.stopPropagation();
            }
            
            const req = teacherRequests.find(r => r.id === requestId);
            if (!req) {
                customAlert('Заявку не знайдено', 'Помилка', 'error');
                return;
            }
            
            if (!req.variants || !req.variants[variantIndex]) {
                customAlert('Варіант не знайдено', 'Помилка', 'error');
                return;
            }
            
            const variant = req.variants[variantIndex];
            const dayName = DAY_NAMES[variant.day] || `День ${variant.day}`;
            const variantInfo = `${dayName}, ${variant.slot} пара, пріоритет ${variant.priority}`;
            
            if (!(await customConfirm(`Відхилити варіант ${variant.priority}?\n\n${variantInfo}`))) {
                return;
            }
            
            // Зберігаємо дані варіанту для ідентифікації
            const variantData = {
                day: variant.day,
                slot: variant.slot,
                week: variant.week,
                priority: variant.priority
            };
            
            // Видаляємо варіант з масиву
            req.variants.splice(variantIndex, 1);
            
            // Якщо варіантів не залишилось - видаляємо весь request
            if (req.variants.length === 0) {
                processedRequests.push({
                    action: 'reject',
                    requestId: requestId
                });
                
                // Додаємо ID оригінальної пари до processedIds
                if (req.original && req.original.id) {
                    processedIds.add(String(req.original.id));
                }
                
                const reqIndex = teacherRequests.findIndex(r => r.id === requestId);
                if (reqIndex >= 0) {
                    teacherRequests.splice(reqIndex, 1);
                }
                
                // Видаляємо pending індикатор (пісочний годинник) - це був останній варіант
                removePendingProposal(requestId);
            } else {
                // Якщо залишились інші варіанти - зберігаємо часткове відхилення з даними варіанту
                processedRequests.push({
                    action: 'reject_variant',
                    requestId: requestId,
                    variantData: variantData  // Зберігаємо дані замість індексу
                });
            }
            
            // Оновлюємо відображення
            renderLessons(true);
            updateDraftAlert();
        }

        function exitCompare() {
            isCompareMode = false;
            document.getElementById('compare-panel').classList.remove('show');
            lessons = JSON.parse(JSON.stringify(liveLessons));
            renderLessons();
        }

        function acceptDiff(id) {
            const strId = String(id);
            const draftItem = draftLessons.find(l => String(l.id) === strId);
            
            if (draftItem) {
                if (draftItem._deleted) {
                    // Пара була видалена - видаляємо з tempLiveLessons
                    tempLiveLessons = tempLiveLessons.filter(l => String(l.id) !== strId);
                } else {
                    // Пара була додана/змінена - замінюємо в tempLiveLessons
                    tempLiveLessons = tempLiveLessons.filter(l => String(l.id) !== strId);
                    tempLiveLessons.push(draftItem);
                }
            } else {
                // Якщо немає в draft - видаляємо
                tempLiveLessons = tempLiveLessons.filter(l => String(l.id) !== strId);
            }
            
            processedIds.add(strId);
            renderLessons(true);
            updateDraftAlert(); // Оновлюємо лічильник
        }

        function rejectDiff(id) {
            const strId = String(id);
            const liveItem = liveLessons.find(l => String(l.id) === strId);
            
            if (liveItem) {
                tempLiveLessons = tempLiveLessons.filter(l => String(l.id) !== strId);
                tempLiveLessons.push(liveItem);
            } else {
                tempLiveLessons = tempLiveLessons.filter(l => String(l.id) !== strId);
            }
            
            processedIds.add(strId);
            renderLessons(true);
            updateDraftAlert(); // Оновлюємо лічильник
        }

        function renderLessons(doDiff = false) {
            document.querySelectorAll('.lesson-card').forEach(el => el.remove());
            
            // Очищаємо маркування слотів для мульти-вибору
            if (!doDiff) {
                document.querySelectorAll('.time-slot').forEach(slot => {
                    slot.classList.remove('choice-target', 'priority-1', 'priority-2', 'priority-3');
                    slot.removeAttribute('data-priority');
                    
                    // Очищаємо move-available та move-conflict ТІЛЬКИ якщо не активний мульти-вибір
                    if (!multiChoiceState.active) {
                        slot.classList.remove('move-available', 'move-conflict');
                    }
                });
            }
            
            let displayList = [];
            
            if (doDiff) {
                const draftMap = new Map((draftLessons||[]).map(l => [String(l.id), l]));
                const liveMap = new Map(liveLessons.map(l => [String(l.id), l]));
                
                console.log('[RENDER DIFF] Draft lessons:', draftLessons ? draftLessons.length : 0);
                console.log('[RENDER DIFF] Live lessons:', liveLessons.length);
                console.log('[RENDER DIFF] Draft with _deleted:', draftLessons ? draftLessons.filter(l => l._deleted).length : 0);
                
                const allIds = new Set([...draftMap.keys(), ...liveMap.keys()]);
                
                allIds.forEach(id => {
                    // --- НОВА ЛОГІКА: Якщо оброблено, показуємо результат ---
                    if (processedIds.has(id)) {
                        const finalLesson = tempLiveLessons.find(l => String(l.id) === id);
                        if (finalLesson) {
                            displayList.push({ ...finalLesson, _status: 'processed' });
                        }
                        return; 
                    }
                    // --------------------------------------------------------

                    const draftL = draftMap.get(id);
                    const liveL = liveMap.get(id);
                    
                    // Логування для дебагу
                    const hasLive = !!liveL;
                    const hasDraft = !!draftL;
                    const hasDeleted = draftL && draftL._deleted;
                    
                    if (hasDeleted || (!hasLive && hasDraft) || (hasLive && !hasDraft)) {
                        console.log(`[DIFF] ID ${id}: live=${hasLive}, draft=${hasDraft}, deleted=${hasDeleted}`);
                        if (hasDraft && draftL._deleted) {
                            console.log(`  → REMOVED (has _deleted marker)`);
                        } else if (!hasLive && hasDraft) {
                            console.log(`  → ADDED (in draft, not in live)`);
                        } else if (hasLive && !hasDraft) {
                            console.log(`  → CONTEXT (in live, not in draft = no changes)`);
                        }
                    }

                    // Перевіряємо чи є маркер _deleted в draft
                    if (draftL && draftL._deleted) {
                        // Пара була видалена
                        if (liveL) {
                            // Якщо є в live - показуємо live версію зі статусом removed
                            displayList.push({ ...liveL, _status: 'removed' });
                        }
                        // Якщо немає в live (викладач додав і одразу видалив) - НЕ показуємо взагалі
                    }
                    else if (!liveL && draftL) {
                        // Додана пара (є в draft але немає в live)
                        console.log(`[RENDER DIFF] ADDED lesson:`, draftL);
                        displayList.push({ ...draftL, _status: 'added' });
                    }
                    else if (liveL && !draftL) {
                        // Пара є в live але немає в draft = НЕ змінювалась
                        displayList.push({ ...liveL, _status: 'context' });
                    }
                    else if (liveL && draftL) {
                        // Обидві є - порівнюємо
                        if (JSON.stringify(liveL) !== JSON.stringify(draftL)) {
                            displayList.push({ ...draftL, _status: 'changed' });
                            displayList.push({ ...liveL, _status: 'moved-source', _ghostId: id });
                        } else {
                            displayList.push({ ...liveL, _status: 'context' });
                        }
                    }
                });
            } else {
                displayList = lessons.filter(l => parseInt(l.week) === parseInt(currentWeek));
            }
            
            // Додаємо ghost lessons для teacher requests в режимі порівняння
            if (isAdmin && teacherRequests && teacherRequests.length > 0 && doDiff) {
                teacherRequests.forEach(req => {
                    if (!req.variants || req.variants.length === 0) return;
                    
                    const originalLesson = liveLessons.find(l => String(l.id) === String(req.lesson_id));
                    if (!originalLesson) return;
                    
                    // Додаємо оригінальну пару як moved-source
                    const originalInCurrentWeek = parseInt(originalLesson.week) === parseInt(currentWeek);
                    if (originalInCurrentWeek) {
                        // Перевіряємо чи вже є ця пара в displayList
                        const existingIndex = displayList.findIndex(l => String(l.id) === String(originalLesson.id));
                        if (existingIndex >= 0) {
                            // Якщо є - змінюємо її статус
                            displayList[existingIndex] = { 
                                ...displayList[existingIndex], 
                                _status: 'moved-source',
                                _ghostId: `request_source_${req.id}`
                            };
                        } else {
                            // Якщо немає - додаємо
                            displayList.push({ 
                                ...originalLesson, 
                                _status: 'moved-source',
                                _ghostId: `request_source_${req.id}`
                            });
                        }
                    }
                    
                    // Додаємо ghost lessons для кожного варіанту
                    req.variants.forEach((variant, idx) => {
                        const variantWeek = variant.week || originalLesson.week;
                        if (parseInt(variantWeek) !== parseInt(currentWeek)) return;
                        
                        const ghostLesson = {
                            ...originalLesson,
                            id: `req_ghost_${req.id}_${idx}`,
                            day: variant.day,
                            slot: variant.slot,
                            week: variantWeek,
                            _isRequestGhost: true,
                            _requestId: req.id,
                            _variantIndex: idx,
                            _priority: variant.priority || (idx + 1),
                            _status: 'added'  // Показуємо як нові пари (зелені)
                        };
                        displayList.push(ghostLesson);
                    });
                });
            }

            const visible = displayList.filter(l => parseInt(l.week) === parseInt(currentWeek));

            visible.forEach(lesson => {
                // Пропускаємо пари що анімуються (для між-тижневого переміщення)
                if (lesson._animating) {
                    return;
                }
                
                // Перевіряємо чи пара відповідає фільтрам
                if (!matchesAdvancedFilters(lesson)) {
                    return; // Пропускаємо пари що не відповідають фільтрам
                }
                
                const slotEl = document.querySelector(`.time-slot[data-day="${lesson.day}"][data-slot="${lesson.slot}"]`);
                if (slotEl) {
                    const card = createCard(lesson, doDiff);
                    if (lesson._status === 'moved-source') slotEl.appendChild(card);
                    else slotEl.insertBefore(card, slotEl.querySelector('.add-btn-slot'));
                }
            });
            
            // Візуалізація мульти-вибору - позначаємо source lesson
            if (multiChoiceState.active && !doDiff && multiChoiceState.sourceLesson) {
                const sourceCard = document.getElementById(multiChoiceState.sourceLesson.id);
                if (sourceCard) {
                    sourceCard.classList.add('source-selected');
                }
            }
            
            if(highlightState.active) reapplyHighlight();
            
            // Застосовуємо фільтр викладача якщо активний
            if (currentTeacherName && !doDiff) {
                applyTeacherFilter();
            }
        }

        function createCard(lesson, doDiff = false) {
            const div = document.createElement('div');
            div.className = 'lesson-card'; 
            div.draggable = !doDiff && !multiChoiceState.active; // Не можна перетягувати в режимі мульти-вибору 
            div.id = lesson._ghostId ? 'ghost-'+lesson._ghostId : lesson.id;
            
            div.dataset.type = lesson.type; 
            div.dataset.group = lesson.group; 
            div.dataset.teacher = lesson.teacher; 
            div.dataset.teacher2 = lesson.teacher2;
            div.dataset.subject = lesson.subject;
            
            if (actionState.active && actionState.sourceId === lesson.id) div.classList.add('action-source');
            
            // Позначаємо pending proposals
            const pending = loadPendingProposals();
            const hasPendingProposal = pending.some(p => p.lessonId === lesson.id);
            if (hasPendingProposal && !isAdmin) {
                div.classList.add('pending-proposal');
            }
            
            // Позначаємо request ghosts
            if (lesson._isRequestGhost) {
                div.classList.add('request-ghost');
                div.classList.add(`priority-${Math.min(lesson._priority || 1, 3)}`);
                div.setAttribute('data-priority', lesson._priority || 1);
                div.setAttribute('data-request-id', lesson._requestId);
                div.setAttribute('data-variant-index', lesson._variantIndex);
            }
            
            let isDiffCard = false;
            if (doDiff && !lesson._isRequestGhost) {
                if (lesson._status === 'removed') { div.classList.add('diff-removed'); isDiffCard=true; }
                else if (lesson._status === 'moved-source') { div.classList.add('diff-moved-source'); isDiffCard=true; }
                else if (lesson._status==='added') { div.classList.add('diff-added'); isDiffCard=true; }
                else if (lesson._status==='changed') { div.classList.add('diff-changed'); isDiffCard=true; }
                else if (lesson._status==='context') { div.classList.add('diff-context'); isDiffCard=true; }
                else if (lesson._status==='processed') { div.classList.add('diff-processed'); isDiffCard=true; }
            }

            // Функція для отримання скорочення та іконки типу
            const getTypeDisplay = (type) => {
                const types = {
                    'Лекція': { short: 'Лк', icon: 'fa-chalkboard-user' },
                    'Лабораторна': { short: 'Лаб', icon: 'fa-desktop' },
                    'Практична': { short: 'Пр', icon: 'fa-laptop-code' },
                    'Семінар': { short: 'Сем', icon: 'fa-users' }
                };
                return types[type] || { short: type, icon: 'fa-book' };
            };
            
            const typeInfo = getTypeDisplay(lesson.type);

            // Логіка відображення аудиторії:
            // - Якщо "Аудиторія 201" → "Ауд. 201"
            // - Якщо "Комп. клас 1" → "Комп. клас 1" (без "Ауд.")
            // - Якщо "Практикум 1" → "Практикум 1" (без "Ауд.")
            let roomDisplay = lesson.room;
            if (lesson.room && typeof lesson.room === 'string' && lesson.room.startsWith('Аудиторія ')) {
                // Видаляємо "Аудиторія ", додаємо "Ауд. "
                const roomNum = lesson.room.replace('Аудиторія ', '');
                roomDisplay = 'Ауд. ' + roomNum;
            }
            
            let teacherDisplay = lesson.teacher; if (lesson.teacher2) teacherDisplay += `, ${lesson.teacher2}`;
            
            let actionsHtml = '';
            // --- ТУТ ЗМІНИ: замість title="..." пишемо data-tooltip="..." ---
            if (!doDiff) {
                const esc = (s) => s.replace(/'/g, "\\'");
                const moveCall = `startMove('${lesson.id}', '${esc(lesson.subject)}', event); closeAllMobileMenus();`;
                const swapCall = `startSwap('${lesson.id}', '${esc(lesson.subject)}', event); closeAllMobileMenus();`;
                const editCall = `openEditById('${lesson.id}'); closeAllMobileMenus();`;
                const deleteCall = `deleteLesson('${lesson.id}', event); closeAllMobileMenus();`;

                actionsHtml = `
                <div class="card-actions">
                    <div class="action-btn btn-duplicate" data-tooltip="Дублювати" onclick="duplicateLesson('${lesson.id}', event); closeAllMobileMenus();"><i class="fa-solid fa-copy"></i></div>
                    <div class="action-btn btn-move" data-tooltip="Перемістити" onclick="${moveCall}"><i class="fa-solid fa-arrows-up-down-left-right"></i></div>
                    <div class="action-btn btn-swap" data-tooltip="Поміняти" onclick="${swapCall}"><i class="fa-solid fa-right-left"></i></div>
                    <div class="action-btn btn-edit" data-tooltip="Редагувати" onclick="${editCall}"><i class="fa-solid fa-pen"></i></div>
                    <div class="action-btn btn-delete" data-tooltip="Видалити" onclick="${deleteCall}"><i class="fa-solid fa-trash"></i></div>
                </div>
                <div class="mobile-actions"><button class="action-btn" onclick="toggleMobileMenu('${lesson.id}', event)"><i class="fa-solid fa-ellipsis-vertical"></i></button><div id="menu-${lesson.id}" class="mobile-menu-dropdown"><div class="mobile-menu-item" onclick="duplicateLesson('${lesson.id}', event); closeAllMobileMenus();"><i class="fa-solid fa-copy"></i> Дублювати</div><div class="mobile-menu-item" onclick="${moveCall}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Перемістити</div><div class="mobile-menu-item" onclick="${swapCall}"><i class="fa-solid fa-right-left"></i> Поміняти</div><div class="mobile-menu-item" onclick="${editCall}"><i class="fa-solid fa-pen"></i> Редагувати</div><div class="mobile-menu-item" onclick="${deleteCall}" style="color: #dc2626;"><i class="fa-solid fa-trash"></i> Видалити</div></div></div>`;
            } else if (isDiffCard && !['moved-source','context','processed'].includes(lesson._status) && !lesson._isRequestGhost) {
                 actionsHtml = `<div class="diff-actions"><div class="btn-approve" style="background:#dcfce7; color:#166534; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer;" data-tooltip="Прийняти" onclick="acceptDiff('${lesson.id}')"><i class="fa-solid fa-check"></i></div><div class="btn-reject" style="background:#fee2e2; color:#991b1b; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer;" data-tooltip="Відхилити" onclick="rejectDiff('${lesson.id}')"><i class="fa-solid fa-xmark"></i></div></div>`;
            } else if (lesson._isRequestGhost && doDiff) {
                // Для request ghost додаємо маленьку кнопку відхилення варіанту
                actionsHtml = `<div class="diff-actions"><div class="btn-reject-ghost" style="background:#fee2e2; color:#991b1b; width:20px; height:20px; border-radius:4px; display:flex; align-items:center; justify-content:center; cursor:pointer; position:absolute; top:4px; right:4px; z-index:20;" data-tooltip="Відхилити варіант" onclick="rejectRequestVariant('${lesson._requestId}', ${lesson._variantIndex}, event)"><i class="fa-solid fa-xmark" style="font-size:10px;"></i></div></div>`;
            }

            // --- І ТУТ ТЕЖ (для груп): замість title пишемо data-tooltip ---
            // Екрануємо апострофи для безпечного використання в onclick
            const safeGroup = (lesson.group || '').replace(/'/g, "\\'");
            const safeSubject = (lesson.subject || '').replace(/'/g, "\\'");
            const safeTeacher = (lesson.teacher || '').replace(/'/g, "\\'");
            
            div.innerHTML = `<div class="card-top-row"><span class="group-badge" onclick="activateHighlight('group', '${safeGroup}', event)" data-tooltip="${lesson.group || ''}">${lesson.group || '-'}</span><span class="type-badge" data-tooltip="${lesson.type}"><i class="fa-solid ${typeInfo.icon}"></i> ${typeInfo.short}</span></div>${actionsHtml}<div class="lesson-subject" onclick="activateHighlight('subject', '${safeSubject}', event)">${lesson.subject}</div><div class="lesson-footer"><div class="info-row teacher-row" onclick="activateHighlight('teacher', '${safeTeacher}', event)"><i class="fa-regular fa-user"></i> ${teacherDisplay}</div><div class="info-row room-row"><i class="fa-solid fa-location-dot"></i> ${roomDisplay}</div>${lesson.note ? `<div style="font-size:9px;color:#d97706;margin-top:2px;">${lesson.note}</div>` : ''}</div>`;
            
            // Обробка кліків на request ghosts (тільки для адміна в режимі порівняння)
            if (lesson._isRequestGhost && isAdmin && doDiff) {
                div.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const requestId = div.getAttribute('data-request-id');
                    const variantIndex = parseInt(div.getAttribute('data-variant-index'));
                    if (requestId && !isNaN(variantIndex)) {
                        await approveRequest(requestId, variantIndex);
                    }
                });
                div.style.cursor = 'pointer';
            } else if (!doDiff) {
                div.addEventListener('dragstart', handleDragStart);
                div.addEventListener('click', (e) => {
                    if(!e.target.closest('.action-btn') && !e.target.closest('.group-badge') && !e.target.closest('.teacher-row') && !e.target.closest('.lesson-subject') && !e.target.closest('.mobile-menu-item')) {
                        // Якщо режим мульти-вибору - обираємо source lesson
                        if (multiChoiceState.active) {
                            e.stopPropagation();
                            if (multiChoiceState.sourceLesson && multiChoiceState.sourceLesson.id === lesson.id) {
                                // Скасувати вибір (клікнули на ту саму обрану пару)
                                multiChoiceState.sourceLesson = null;
                                multiChoiceState.targets = [];
                            } else if (multiChoiceState.sourceLesson) {
                                // Вже обрано іншу пару - показуємо помилку
                                customAlert('Ви вже обрали пару для переносу! Щоб змінити вибір, спочатку клікніть на обрану пару щоб скасувати вибір.', 'Увага', 'warning');
                                return;
                            } else {
                                // Обрати цю пару як джерело (поки що нічого не обрано)
                                multiChoiceState.sourceLesson = lesson;
                                multiChoiceState.targets = [];
                            }
                            renderLessons();
                            highlightSlotsForMultiChoice(); // Підсвічуємо слоти ПІСЛЯ рендеру
                            updateMultiChoiceFab();
                            return;
                        }
                        
                        if (actionState.active) { if (actionState.type === 'swap') performSwap(lesson.id); else customAlert("Клікніть на ПОРОЖНІЙ слот."); } else openEditModal(lesson);
                    }
                });
            }
            
            // Додаємо обробники hover для підсвічування пов'язаних пар (тільки в режимі diff)
            if (doDiff) {
                // Для moved-source пар (БУЛО)
                if (lesson._status === 'moved-source' && lesson._ghostId) {
                    const originalId = lesson._ghostId; // Це і є оригінальний ID
                    div.addEventListener('mouseenter', () => highlightRelatedLessons(originalId, 'draft'));
                    div.addEventListener('mouseleave', clearRelatedHighlight);
                }
                
                // Для changed пар (варіанти переміщення з draft)
                if (lesson._status === 'changed') {
                    div.addEventListener('mouseenter', () => highlightRelatedLessons(lesson.id, 'draft'));
                    div.addEventListener('mouseleave', clearRelatedHighlight);
                }
                
                // Для request ghosts
                if (lesson._isRequestGhost) {
                    div.addEventListener('mouseenter', () => highlightRelatedLessons(lesson._requestId, 'request'));
                    div.addEventListener('mouseleave', clearRelatedHighlight);
                }
            }
            
            return div;
        }
        
        function highlightRelatedLessons(identifier, type) {
            // Очищаємо попереднє підсвічування
            clearRelatedHighlight();
            
            if (type === 'draft') {
                // Підсвічуємо всі картки пов'язані з цим ID
                // - changed пара має card.id === identifier
                // - moved-source (привид) має card.id === 'ghost-' + identifier
                
                document.querySelectorAll('.lesson-card').forEach(card => {
                    // Перевіряємо чи це changed пара
                    if (card.id === identifier) {
                        card.classList.add('hover-highlight');
                    }
                    
                    // Перевіряємо чи це moved-source привид
                    if (card.id === 'ghost-' + identifier) {
                        card.classList.add('hover-highlight');
                    }
                });
            } else if (type === 'request') {
                // Підсвічуємо всі request ghosts з тим же requestId та оригінальну пару
                const requestId = identifier;
                
                // Знаходимо request
                const request = teacherRequests.find(r => r.id === requestId);
                if (request) {
                    // Підсвічуємо оригінальну пару (moved-source з міткою БУЛО)
                    // Вона може мати id = 'ghost-request_source_' + requestId
                    const ghostSourceId = 'ghost-request_source_' + requestId;
                    const ghostSourceCard = document.getElementById(ghostSourceId);
                    if (ghostSourceCard) {
                        ghostSourceCard.classList.add('hover-highlight');
                    }
                    
                    // Також підсвічуємо оригінальну пару якщо вона без змін
                    const originalCard = document.getElementById(request.lesson_id);
                    if (originalCard) {
                        originalCard.classList.add('hover-highlight');
                    }
                    
                    // Підсвічуємо всі варіанти (request ghosts)
                    document.querySelectorAll(`[data-request-id="${requestId}"]`).forEach(card => {
                        card.classList.add('hover-highlight');
                    });
                }
            }
        }
        
        function clearRelatedHighlight() {
            document.querySelectorAll('.lesson-card.hover-highlight').forEach(card => {
                card.classList.remove('hover-highlight');
            });
        }

        // --- BASIC FUNCTIONS ---
        function updateListsFromLessons() {
            // Оновлюємо списки з поточних занять
            const newTeachers = [...new Set(lessons.map(l => l.teacher).filter(t => t))];
            const newSubjects = [...new Set(lessons.map(l => l.subject).filter(s => s))];
            const newGroups = [...new Set(lessons.map(l => l.group).filter(g => g))];
            
            // Для аудиторій НЕ додаємо "Аудиторія N" - тільки звичайні назви
            const newRooms = [...new Set(lessons.map(l => l.room).filter(r => r && typeof r === 'string' && !r.startsWith('Аудиторія ')))];
            
            // Об'єднуємо з існуючими списками
            teachersList = [...new Set([...teachersList, ...newTeachers])].sort();
            subjectsList = [...new Set([...subjectsList, ...newSubjects])].sort();
            groupsList = [...new Set([...groupsList, ...newGroups])].sort();
            roomsList = [...new Set([...roomsList, ...newRooms])].sort();
            
            // Зберігаємо оновлені списки
            localStorage.setItem('uni_teachers_list', JSON.stringify(teachersList));
            localStorage.setItem('uni_subjects_list', JSON.stringify(subjectsList));
            localStorage.setItem('uni_groups_list', JSON.stringify(groupsList));
            localStorage.setItem('uni_rooms_list', JSON.stringify(roomsList));
            
            // Оновлюємо datalists
            populateDatalists();
        }
        function populateDatalists() { 
            const fill = (id, arr) => { 
                const el = document.getElementById(id); 
                if (!el) return;
                el.innerHTML = ''; 
                if(Array.isArray(arr)) arr.forEach(i => { 
                    const o = document.createElement('option'); 
                    o.value = i; 
                    el.appendChild(o); 
                }); 
            }; 
            fill('teachersList', teachersList); 
            fill('subjectsList', subjectsList); 
            fill('groupsList', groupsList);
            
            console.log('[DEBUG] roomsList:', roomsList);
            
            // Фільтруємо зайві значення (цифри, порожні рядки)
            const filteredRooms = roomsList.filter(room => {
                if (!room || typeof room !== 'string') return false;
                if (room.trim() === '') return false;
                // Видаляємо чисті цифри (1, 2, 3 тощо)
                if (/^\d+$/.test(room.trim())) return false;
                return true;
            });
            
            console.log('[DEBUG] filteredRooms:', filteredRooms);
            
            // Заповнюємо datalist ВІДФІЛЬТРОВАНИМИ аудиторіями (для фільтрів)
            fill('roomsList', filteredRooms);
            
            // Заповнюємо select аудиторій для створення пари
            const roomSelect = document.getElementById('inputRoomSelect');
            if (roomSelect) {
                console.log('[DEBUG] Clearing and populating roomSelect');
                
                // Очищаємо select
                roomSelect.innerHTML = '';
                
                // Додаємо базові опції
                const defaultOption = document.createElement('option');
                defaultOption.value = '';
                defaultOption.disabled = true;
                defaultOption.selected = true;
                defaultOption.textContent = 'Оберіть...';
                roomSelect.appendChild(defaultOption);
                
                const auditoriumOption = document.createElement('option');
                auditoriumOption.value = 'auditorium';
                auditoriumOption.textContent = 'Аудиторія (номер вказати вручну)';
                roomSelect.appendChild(auditoriumOption);
                
                // Додаємо аудиторії з filteredRooms
                if (Array.isArray(filteredRooms) && filteredRooms.length > 0) {
                    console.log('[DEBUG] Adding rooms from filteredRooms:', filteredRooms);
                    filteredRooms.forEach(room => {
                        console.log('[DEBUG] Adding room:', room);
                        const option = document.createElement('option');
                        option.value = room;
                        option.textContent = room;
                        roomSelect.appendChild(option);
                    });
                }
                
                console.log('[DEBUG] Final options count:', roomSelect.options.length);
                console.log('[DEBUG] Options:', Array.from(roomSelect.options).map(o => o.textContent));
            }
        }
        function updateCloudStatus(type, text) { const el = document.getElementById('cloudStatus'); el.className = 'cloud-status'; if(type === 'saved') { el.classList.add('status-saved'); el.innerHTML = `<i class="fa-solid fa-cloud-check"></i> <span>${text}</span>`; } else if (type === 'pending') { el.classList.add('status-pending'); el.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> <span>${text}</span>`; } else { el.classList.add('status-error'); el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${text}</span>`; } }
        function updateWeekWatermark() {
            const el = document.getElementById('week-watermark');
            if (!el) return;
            el.textContent = currentWeek === 2 ? '2' : '1';
        }

        // Update current week indicator
        function updateCurrentWeekIndicator(isNextWeek = false) {
            const indicator = document.getElementById('currentWeekIndicator');
            const text = document.getElementById('currentWeekText');
            
            if (!indicator || !text) return;
            
            console.log('[DEBUG updateCurrentWeekIndicator] isNextWeek:', isNextWeek, 'actualCurrentWeek:', actualCurrentWeek);
            
            // Якщо вихідні (isNextWeek = true) - показуємо протилежний тиждень
            // Якщо робочі дні - показуємо поточний тиждень
            let weekToShow = actualCurrentWeek;
            if (isNextWeek) {
                // Наступний тиждень = протилежний до поточного
                weekToShow = (actualCurrentWeek === 1) ? 2 : 1;
                console.log('[DEBUG] Weekend mode: actualCurrentWeek', actualCurrentWeek, '→ showing next week:', weekToShow);
            }
            
            const weekRoman = weekToShow === 1 ? 'I' : 'II';
            
            if (isNextWeek) {
                text.textContent = `Наступний тиждень: ${weekRoman}`;
                console.log('[DEBUG] Setting text to: Наступний тиждень:', weekRoman);
            } else {
                text.textContent = `Поточний тиждень: ${weekRoman}`;
                console.log('[DEBUG] Setting text to: Поточний тиждень:', weekRoman);
            }
            
            // Show indicator
            indicator.style.display = 'flex';
        }


        function setWeek(w) { 
            currentWeek = parseInt(w); 
            document.querySelectorAll('.week-btn').forEach(b => b.classList.remove('active')); 

            const desktopBtn = document.getElementById(`btn-week-${w}`);
            const mobileBtn = document.getElementById(`btn-week-${w}-mobile`);
            if (desktopBtn) desktopBtn.classList.add('active');
            if (mobileBtn) mobileBtn.classList.add('active');

            updateWeekWatermark();

            // Анімований перехід сітки (як у rozklad_kaf16.html)
            const scheduleEl = document.getElementById('schedule-container');
            if (scheduleEl) {
                scheduleEl.classList.remove('schedule-fade');
                // Перезапускаємо анімацію
                void scheduleEl.offsetWidth;
                scheduleEl.classList.add('schedule-fade');
            }
            
            renderLessons(isCompareMode); 
            checkConflicts(); 
            if(highlightState.active) reapplyHighlight();
            
            // Оновлюємо лічильник для нового тижня
            if (isCompareMode) {
                updateDraftAlert();
            }
            
            // Якщо в режимі дублювання - оновлюємо підсвічування для нового тижня
            if (duplicateState.active) {
                duplicateState.targetWeek = w;
                highlightSlotsForDuplication(duplicateState.sourceLesson);
            }
            
            // Якщо в режимі переміщення - оновлюємо підсвічування
            if (actionState.active && actionState.type === 'move' && actionState.sourceLesson) {
                highlightSlotsForMove(actionState.sourceLesson);
            }
            
            // Оновлюємо підсвічування поточного дня
            updateLiveStatus();
        }
        function renderGrid() { const days = [1, 2, 3, 4, 5]; days.forEach(day => { const col = document.getElementById(`day-${day}`); const header = col.querySelector('.day-header'); col.innerHTML = ''; col.appendChild(header); TIME_SLOTS[day].forEach(slot => { const d = document.createElement('div'); d.className = 'time-slot'; d.dataset.day = day; d.dataset.slot = slot.id; d.innerHTML = `<div class="slot-header-row"><div class="slot-number-badge">${slot.num}</div><div class="time-text">${slot.time}</div></div><div class="add-btn-slot">+</div>`; d.addEventListener('dragover', handleDragOver); d.addEventListener('drop', handleDrop); d.addEventListener('click', (e) => handleSlotClick(day, slot.id, e)); col.appendChild(d); }); }); }
        
        function handleDragStart(e) { if(actionState.active || isCompareMode || multiChoiceState.active) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', this.id); actionState.type='move'; }
        function handleDragOver(e) { e.preventDefault(); if(!actionState.active && !isCompareMode) this.classList.add('drag-over'); }
        function handleDrop(e) { e.preventDefault(); this.classList.remove('drag-over'); if(isCompareMode) return; const id = e.dataTransfer.getData('text/plain'); const slotEl = e.target.closest('.time-slot'); if(id && slotEl) { const idx = lessons.findIndex(l => l.id === id); if(idx > -1) { lessons[idx].day = parseInt(slotEl.dataset.day); lessons[idx].slot = parseInt(slotEl.dataset.slot); lessons[idx].week = parseInt(currentWeek); finalizeAction(); } } }
        function startMove(id, title, e) { 
            e.stopPropagation(); 
            clearHighlight(); 
            
            const lesson = lessons.find(l => l.id === id);
            if (!lesson) return;
            
            actionState = { active: true, type: 'move', sourceId: id, sourceLesson: lesson }; 
            document.body.classList.add('mode-move'); 
            showActionPanel(`Переміщення: <b>${title}</b>`, 'mode-move'); 
            renderLessons();
            
            // Підсвічуємо всі слоти
            highlightSlotsForMove(lesson);
        }
        
        function highlightSlotsForMove(sourceLesson) {
            // Спочатку очищаємо всі попередні підсвічування
            document.querySelectorAll('.time-slot').forEach(slot => {
                slot.classList.remove('move-available', 'move-conflict');
            });
            
            // Тепер підсвічуємо слоти для поточного тижня
            document.querySelectorAll('.time-slot').forEach(slot => {
                const day = parseInt(slot.dataset.day);
                const slotNum = parseInt(slot.dataset.slot);
                const week = currentWeek;
                
                // Перевіряємо конфлікти (використовуємо ту саму логіку що для дублювання)
                const hasConflict = checkDuplicationConflict(sourceLesson, week, day, slotNum);
                
                if (hasConflict) {
                    slot.classList.add('move-conflict');
                } else {
                    slot.classList.add('move-available');
                }
            });
        }

        function startSwap(id, title, e) { e.stopPropagation(); clearHighlight(); actionState = { active: true, type: 'swap', sourceId: id }; document.body.classList.add('mode-swap'); showActionPanel(`Обмін: <b>${title}</b>`, 'mode-swap'); renderLessons(); }
        function showActionPanel(html, cssClass) { const p = document.getElementById('action-panel'); p.className = ''; p.classList.add(cssClass, 'show'); p.querySelector('span').innerHTML = html; }
        
        async function performMoveToEmpty(day, slot) { 
            const idx = lessons.findIndex(l => l.id === actionState.sourceId);
            if (idx === -1) return;
            
            const sourceLesson = lessons[idx];
            const sourceWeek = parseInt(sourceLesson.week);
            const targetWeek = parseInt(currentWeek);
            const isWeekChange = sourceWeek !== targetWeek;
            
            // Перевіряємо конфлікти
            const hasConflict = checkDuplicationConflict(sourceLesson, currentWeek, day, slot);
            
            if (hasConflict) {
                const conflictMessages = {
                    'group': `⚠️ Конфлікт: Група ${hasConflict.lesson.group} вже має пару в цей час!\n\n${hasConflict.lesson.subject} (${hasConflict.lesson.teacher})\n\nВсе одно перемістити?`,
                    'teacher': `⚠️ Конфлікт: Викладач ${hasConflict.lesson.teacher} вже зайнятий в цей час!\n\n${hasConflict.lesson.subject} (${hasConflict.lesson.group})\n\nВсе одно перемістити?`,
                    'room': `⚠️ Конфлікт: Аудиторія ${hasConflict.lesson.room} вже зайнята в цей час!\n\n${hasConflict.lesson.subject} (${hasConflict.lesson.teacher})\n\nВсе одно перемістити?`
                };
                
                if (!(await customConfirm(conflictMessages[hasConflict.type]))) {
                    return;
                }
            }
            
            // Зберігаємо ID перед будь-якими діями
            const lessonId = lessons[idx].id;
            
            if (isWeekChange) {
                // Для між-тижневого переміщення: позначаємо пару як "анімується"
                lessons[idx]._animating = true;
                
                // Переміщуємо дані
                lessons[idx].day = day; 
                lessons[idx].slot = slot; 
                lessons[idx].week = targetWeek;
                
                // Оновлюємо (пара буде сховано через _animating)
                cancelAction();
                triggerAutoSave();
                renderLessons();
                checkConflicts();
                
                // Анімація влету
                await animateLessonFlyIn(lessonId, day, slot);
                
                // Прибираємо маркер анімації
                delete lessons[idx]._animating;
            } else {
                // Для переміщення в межах тижня - звичайна анімація
                await animateLessonMove(actionState.sourceId, day, slot);
                
                // Переміщуємо
                lessons[idx].day = day; 
                lessons[idx].slot = slot; 
                lessons[idx].week = targetWeek;
                
                finalizeAction();
            }
        }

        async function performSwap(tId) { 
            if (actionState.sourceId === tId) return; 
            const sIdx = lessons.findIndex(l => l.id === actionState.sourceId); 
            const tIdx = lessons.findIndex(l => l.id === tId); 
            if (sIdx > -1 && tIdx > -1) {
                const sourceWeek = parseInt(lessons[sIdx].week);
                const targetWeek = parseInt(lessons[tIdx].week);
                const isWeekChange = sourceWeek !== targetWeek;
                
                if (isWeekChange) {
                    // Запам'ятовуємо дані перед обміном
                    const sourceId = lessons[sIdx].id;
                    const targetId = lessons[tIdx].id;
                    const targetDay = lessons[tIdx].day;
                    const targetSlot = lessons[tIdx].slot;
                    
                    // Спочатку анімація вильоту target пари (вона йде на інший тиждень)
                    await animateLessonFlyOut(targetId);
                    
                    // Позначаємо source пару як анімується
                    lessons[sIdx]._animating = true;
                    
                    // Обмін даних
                    const tmp = { d: lessons[sIdx].day, s: lessons[sIdx].slot, w: lessons[sIdx].week }; 
                    lessons[sIdx].day = lessons[tIdx].day; 
                    lessons[sIdx].slot = lessons[tIdx].slot; 
                    lessons[sIdx].week = lessons[tIdx].week; 
                    lessons[tIdx].day = tmp.d; 
                    lessons[tIdx].slot = tmp.s; 
                    lessons[tIdx].week = tmp.w;
                    
                    // Оновлюємо без анімації
                    cancelAction();
                    triggerAutoSave();
                    renderLessons();
                    checkConflicts();
                    
                    // Анімація влету source пари (вона прилетіла на поточний тиждень)
                    await animateLessonFlyIn(sourceId, targetDay, targetSlot);
                } else {
                    // Звичайна анімація обміну в межах тижня
                    await animateLessonSwap(actionState.sourceId, tId);
                    
                    const tmp = { d: lessons[sIdx].day, s: lessons[sIdx].slot, w: lessons[sIdx].week }; 
                    lessons[sIdx].day = lessons[tIdx].day; lessons[sIdx].slot = lessons[tIdx].slot; lessons[sIdx].week = lessons[tIdx].week; 
                    lessons[tIdx].day = tmp.d; lessons[tIdx].slot = tmp.s; lessons[tIdx].week = tmp.w; 
                    
                    finalizeAction();
                }
            } else {
                finalizeAction();
            }
        }
        
        async function animateLessonMove(lessonId, targetDay, targetSlotNum) {
            const sourceCard = document.getElementById(lessonId);
            const targetSlotEl = document.querySelector(`.time-slot[data-day="${targetDay}"][data-slot="${targetSlotNum}"]`);
            
            if (!sourceCard || !targetSlotEl) return;
            
            // Клонуємо картку для анімації
            const clone = sourceCard.cloneNode(true);
            clone.classList.add('animating-move');
            
            const sourceRect = sourceCard.getBoundingClientRect();
            const targetRect = targetSlotEl.getBoundingClientRect();
            
            // Позиціонуємо клон на місці оригіналу
            clone.style.left = sourceRect.left + 'px';
            clone.style.top = sourceRect.top + 'px';
            clone.style.width = sourceRect.width + 'px';
            clone.style.height = sourceRect.height + 'px';
            
            document.body.appendChild(clone);
            
            // Ховаємо оригінал
            sourceCard.classList.add('fade-out');
            
            // Чекаємо кадр для початку анімації
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            // Переміщуємо клон до цільової позиції
            clone.style.left = targetRect.left + 10 + 'px';
            clone.style.top = targetRect.top + 35 + 'px';
            
            // Чекаємо завершення анімації
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Прибираємо клон
            clone.remove();
        }
        
        async function animateLessonSwap(sourceId, targetId) {
            const sourceCard = document.getElementById(sourceId);
            const targetCard = document.getElementById(targetId);
            
            if (!sourceCard || !targetCard) return;
            
            // Клонуємо обидві картки
            const sourceClone = sourceCard.cloneNode(true);
            const targetClone = targetCard.cloneNode(true);
            
            sourceClone.classList.add('animating-move');
            targetClone.classList.add('animating-move');
            
            const sourceRect = sourceCard.getBoundingClientRect();
            const targetRect = targetCard.getBoundingClientRect();
            
            // Позиціонуємо клони
            sourceClone.style.left = sourceRect.left + 'px';
            sourceClone.style.top = sourceRect.top + 'px';
            sourceClone.style.width = sourceRect.width + 'px';
            sourceClone.style.height = sourceRect.height + 'px';
            
            targetClone.style.left = targetRect.left + 'px';
            targetClone.style.top = targetRect.top + 'px';
            targetClone.style.width = targetRect.width + 'px';
            targetClone.style.height = targetRect.height + 'px';
            
            document.body.appendChild(sourceClone);
            document.body.appendChild(targetClone);
            
            // Ховаємо оригінали
            sourceCard.classList.add('fade-out');
            targetCard.classList.add('fade-out');
            
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            // Міняємо місцями
            sourceClone.style.left = targetRect.left + 'px';
            sourceClone.style.top = targetRect.top + 'px';
            targetClone.style.left = sourceRect.left + 'px';
            targetClone.style.top = sourceRect.top + 'px';
            
            await new Promise(resolve => setTimeout(resolve, 600));
            
            sourceClone.remove();
            targetClone.remove();
        }
        
        async function animateLessonFlyIn(lessonId, targetDay, targetSlotNum) {
            console.log('[FLY-IN] Starting animation for:', lessonId);
            
            // Знаходимо пару в масиві
            const lesson = lessons.find(l => l.id === lessonId);
            if (!lesson) {
                console.warn('[FLY-IN] Lesson not found:', lessonId);
                return;
            }
            
            // Знаходимо цільовий слот
            const targetSlotEl = document.querySelector(`.time-slot[data-day="${targetDay}"][data-slot="${targetSlotNum}"]`);
            if (!targetSlotEl) {
                console.warn('[FLY-IN] Target slot not found');
                return;
            }
            
            // Створюємо картку для анімації
            const card = createCard(lesson, false);
            card.classList.add('animating-move');
            
            const targetRect = targetSlotEl.getBoundingClientRect();
            
            // Стартова позиція - вище екрану
            card.style.position = 'fixed';
            card.style.left = targetRect.left + 10 + 'px';
            card.style.top = (targetRect.top - 150) + 'px';
            card.style.width = (targetRect.width - 20) + 'px';
            card.style.transform = 'scale(0.5)';
            card.style.opacity = '0';
            card.style.zIndex = '9999';
            
            document.body.appendChild(card);
            
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            // Влітає вниз на своє місце та збільшується
            card.style.top = targetRect.top + 35 + 'px';
            card.style.transform = 'scale(1)';
            card.style.opacity = '1';
            
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Прибираємо тимчасову картку
            card.remove();
            
            // Прибираємо маркер _animating і рендеримо пару нормально
            const lessonIndex = lessons.findIndex(l => l.id === lessonId);
            if (lessonIndex >= 0) {
                delete lessons[lessonIndex]._animating;
                renderLessons();
            }
            
            console.log('[FLY-IN] Animation completed');
        }
        
        async function animateLessonFlyOut(lessonId) {
            console.log('[FLY-OUT] Starting animation for:', lessonId);
            
            const sourceCard = document.getElementById(lessonId);
            if (!sourceCard) {
                console.warn('[FLY-OUT] Card not found:', lessonId);
                return;
            }
            
            // Клонуємо картку
            const clone = sourceCard.cloneNode(true);
            clone.classList.add('animating-move');
            
            const sourceRect = sourceCard.getBoundingClientRect();
            
            // Позиціонуємо клон на місці оригіналу
            clone.style.left = sourceRect.left + 'px';
            clone.style.top = sourceRect.top + 'px';
            clone.style.width = sourceRect.width + 'px';
            clone.style.height = sourceRect.height + 'px';
            
            document.body.appendChild(clone);
            
            // Ховаємо оригінал
            sourceCard.style.opacity = '0';
            
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            // Вилітає вгору та зменшується
            clone.style.top = (sourceRect.top - 150) + 'px';
            clone.style.transform = 'scale(0.5)';
            clone.style.opacity = '0';
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Прибираємо клон
            clone.remove();
            
            console.log('[FLY-OUT] Animation completed');
        }
        
        async function animateLessonDuplicate(sourceId, newId, targetDay, targetSlot) {
            console.log('[DUPLICATE] Starting animation from:', sourceId, 'to:', newId);
            
            const sourceCard = document.getElementById(sourceId);
            const targetSlotEl = document.querySelector(`.time-slot[data-day="${targetDay}"][data-slot="${targetSlot}"]`);
            
            if (!sourceCard || !targetSlotEl) {
                console.warn('[DUPLICATE] Source or target not found');
                // Якщо не знайшли елементи - просто показуємо пару без анімації
                const lessonIndex = lessons.findIndex(l => l.id === newId);
                if (lessonIndex >= 0) {
                    delete lessons[lessonIndex]._animating;
                    renderLessons();
                }
                return;
            }
            
            // Знаходимо нову пару в масиві
            const newLesson = lessons.find(l => l.id === newId);
            if (!newLesson) return;
            
            // Створюємо клон оригінальної картки для анімації
            const clone = sourceCard.cloneNode(true);
            clone.classList.add('animating-move');
            clone.id = 'clone-' + newId;
            
            const sourceRect = sourceCard.getBoundingClientRect();
            const targetRect = targetSlotEl.getBoundingClientRect();
            
            // Стартова позиція - на місці оригіналу
            clone.style.left = sourceRect.left + 'px';
            clone.style.top = sourceRect.top + 'px';
            clone.style.width = sourceRect.width + 'px';
            clone.style.height = sourceRect.height + 'px';
            clone.style.transform = 'scale(1)';
            clone.style.opacity = '0.8';
            
            document.body.appendChild(clone);
            
            // Додаємо ефект "народження" оригіналу
            sourceCard.style.transform = 'scale(0.95)';
            
            await new Promise(resolve => requestAnimationFrame(resolve));
            
            // Летить до цільової позиції з ефектом
            clone.style.left = targetRect.left + 10 + 'px';
            clone.style.top = targetRect.top + 35 + 'px';
            clone.style.transform = 'scale(1.05)';
            clone.style.opacity = '1';
            
            // Повертаємо оригінал
            sourceCard.style.transform = 'scale(1)';
            
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Фінальний ефект - злегка зменшується
            clone.style.transform = 'scale(1)';
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Прибираємо клон
            clone.remove();
            
            // Показуємо справжню нову пару
            const lessonIndex = lessons.findIndex(l => l.id === newId);
            if (lessonIndex >= 0) {
                delete lessons[lessonIndex]._animating;
                renderLessons();
            }
            
            console.log('[DUPLICATE] Animation completed');
        }

        function finalizeAction() { cancelAction(); triggerAutoSave(); renderLessons(); checkConflicts(); }
        function cancelAction() { 
            actionState = { active: false, type: null, sourceId: null, sourceLesson: null }; 
            document.body.classList.remove('mode-move', 'mode-swap'); 
            
            // Прибираємо підсвічування слотів
            document.querySelectorAll('.time-slot').forEach(slot => {
                slot.classList.remove('move-available', 'move-conflict');
            });
            
            document.getElementById('action-panel').className = ''; 
            renderLessons(); 
        }
        async function handleSlotClick(day, slot, e) { 
            if(isCompareMode) return; 
            
            // Якщо режим мульти-вибору - обробляємо тут
            if (multiChoiceState.active) {
                if (handleSlotClickMultiChoice(day, slot, e)) return;
            }
            
            if (e.target.closest('.lesson-card')) return; 
            
            // Якщо режим дублювання - не обробляємо тут (обробляється в highlightSlotsForDuplication)
            if (duplicateState.active) return;
            
            if (actionState.active) { 
                if (actionState.type === 'move') await performMoveToEmpty(day, slot); 
                else customAlert("Ви в режимі Обміну. Клікніть на ІНШУ ПАРУ."); 
            } else {
                // На мобільних відкриваємо тільки якщо клікнули на кнопку "+"
                const isMobile = window.innerWidth <= 768;
                if (isMobile && !e.target.closest('.add-btn-slot')) {
                    return; // Ігноруємо випадкові торкання
                }
                openNewModal(day, slot);
            }
        }

        function checkConflicts() { document.querySelectorAll('.lesson-card').forEach(c => c.classList.remove('conflict')); document.querySelectorAll('.conflict-blinker').forEach(el => el.classList.remove('conflict-blinker')); if(isCompareMode) return; const activeLessons = lessons.filter(l => parseInt(l.week) === parseInt(currentWeek)); const slotsMap = {}; activeLessons.forEach(l => { const k = `${l.day}-${l.slot}`; if (!slotsMap[k]) slotsMap[k] = []; slotsMap[k].push(l); }); for (const key in slotsMap) { const groupLessons = slotsMap[key]; if (groupLessons.length > 1) { for (let i = 0; i < groupLessons.length; i++) { for (let j = i + 1; j < groupLessons.length; j++) { const l1 = groupLessons[i]; const l2 = groupLessons[j]; const c1 = document.getElementById(l1.id); const c2 = document.getElementById(l2.id); if(!c1 || !c2) continue; let conflictFound = false; if (l1.room && l2.room && l1.room === l2.room) { conflictFound = true; c1.querySelector('.room-row')?.classList.add('conflict-blinker'); c2.querySelector('.room-row')?.classList.add('conflict-blinker'); } const t1 = [l1.teacher, l1.teacher2].filter(t => t); const t2 = [l2.teacher, l2.teacher2].filter(t => t); if (t1.some(t => t2.includes(t))) { conflictFound = true; c1.querySelector('.teacher-row')?.classList.add('conflict-blinker'); c2.querySelector('.teacher-row')?.classList.add('conflict-blinker'); } if (l1.group && l2.group) { const g1 = l1.group.split(',').map(s => s.trim()); const g2 = l2.group.split(',').map(s => s.trim()); if (g1.some(g => g2.includes(g))) { conflictFound = true; c1.querySelector('.group-badge')?.classList.add('conflict-blinker'); c2.querySelector('.group-badge')?.classList.add('conflict-blinker'); } } if (conflictFound) { c1.classList.add('conflict'); c2.classList.add('conflict'); } } } } } }
        function toggleMobileMenu(id, e) { e.stopPropagation(); const menu = document.getElementById(`menu-${id}`); document.querySelectorAll('.mobile-menu-dropdown').forEach(m => { if(m.id !== `menu-${id}`) m.classList.remove('show'); }); menu.classList.toggle('show'); }
        function closeAllMobileMenus() { document.querySelectorAll('.mobile-menu-dropdown').forEach(m => m.classList.remove('show')); }
        function openEditById(id) { const l = lessons.find(x => x.id === id); if(l) openEditModal(l); }
        function activateHighlight(type, val, e) { 
            e.stopPropagation(); 
            if(!val) return; 
            
            // Блокуємо highlight на мобільних пристроях для не-адмінів (викладачів, гостей)
            if (window.innerWidth <= 768 && !isAdmin) {
                return;
            }
            
            // Очищаємо розширений пошук, якщо він був активний
            if (Object.keys(advancedSearchFilters).length > 0) {
                advancedSearchFilters = {};
                advancedSearchFiltersOriginal = {};
                updateFilterButtonState(false);
            }
            
            highlightState = { active: true, type, value: val }; 
            document.body.classList.add('spotlight-active'); 
            const p = document.getElementById('filter-panel'); 
            
            // Відновлюємо початковий HTML панелі для highlight
            p.innerHTML = `<span id="filter-msg"><i class="fa-solid fa-filter"></i> ${val}</span><button onclick="clearHighlight()" style="background:white; border:none; color:#1e3a8a; font-weight:700; padding:4px 8px; border-radius:4px; cursor:pointer;">Скинути (Esc)</button>`;
            
            p.classList.add('show'); 
            reapplyHighlight(); 
        }
        function reapplyHighlight() { 
            document.querySelectorAll('.lesson-card').forEach(c => { 
                // Очищаємо inline стилі які могли встановитися від teacherViewMode
                c.style.opacity = '';
                c.style.filter = '';
                c.style.display = '';
                
                c.classList.remove('highlighted'); 
                let match = false; 
                if(highlightState.type === 'group' && c.dataset.group && c.dataset.group.includes(highlightState.value)) match = true; 
                if(highlightState.type === 'teacher' && (c.dataset.teacher === highlightState.value || c.dataset.teacher2 === highlightState.value)) match = true; 
                if(highlightState.type === 'subject' && c.dataset.subject === highlightState.value) match = true; 
                if(match) c.classList.add('highlighted'); 
            }); 
        }
        function clearHighlight() { 
            highlightState.active = false; 
            document.body.classList.remove('spotlight-active'); 
            document.getElementById('filter-panel').classList.remove('show'); 
            document.querySelectorAll('.lesson-card').forEach(c => c.classList.remove('highlighted')); 
            
            // Якщо був активний режим викладача - відновлюємо його
            if (currentTeacherName) {
                applyTeacherFilter();
            }
        }
        function handleBodyClick(e) { if(!e.target.closest('.mobile-actions')) closeAllMobileMenus(); if(highlightState.active && !e.target.closest('.lesson-card') && !e.target.closest('.top-bar') && !e.target.closest('.modal-box')) clearHighlight(); }
        function updateLiveStatus() { 
            const now = new Date(); 
            const d = now.getDay(); 
            const m = now.getHours()*60 + now.getMinutes(); 
            
            document.querySelectorAll('.time-slot.drag-over').forEach(el => el.classList.remove('drag-over')); 
            document.querySelectorAll('.day-column').forEach(c => c.classList.remove('current-day')); 
            
            // Обчислюємо який тиждень зараз реально
            let realCurrentWeek = actualCurrentWeek; // За замовчуванням з бекенду
            
            if (semesterStartDate) {
                const diffTime = now - semesterStartDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const weekNumber = Math.floor(diffDays / 7);
                realCurrentWeek = (weekNumber % 2 === 0) ? 1 : 2;
            }
            
            // Підсвічуємо тільки якщо переглядаємо реальний поточний тиждень
            if(d>=1 && d<=5 && currentWeek === realCurrentWeek) {
                document.getElementById(`day-${d}`).classList.add('current-day'); 
            }
            
            document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('current-now')); 
            if(d>=1 && d<=5 && currentWeek === realCurrentWeek) { 
                const slot = TIME_SLOTS[d].find(s => m >= s.start && m <= s.end); 
                if(slot) document.querySelector(`.time-slot[data-day="${d}"][data-slot="${slot.id}"]`)?.classList.add('current-now'); 
            } 
        }
        function exportToImage() { const el = document.getElementById('schedule-container'); const h = el.style.height; el.style.height = 'auto'; html2canvas(el, { scale: 2, backgroundColor: '#f1f5f9' }).then(c => { const a = document.createElement('a'); a.download = `schedule_week_${currentWeek}.png`; a.href = c.toDataURL(); a.click(); el.style.height = h; }); }
        
        /**
         * Експорт розкладу в Excel з двома аркушами (Тиждень I та Тиждень II)
         */
        function exportToExcel() {
            try {
                // Створюємо нову книгу
                const wb = XLSX.utils.book_new();
                
                // ========== АРКУШ 1: Тиждень I ==========
                const week1Grid = createWeekGrid(1);
                const ws1 = XLSX.utils.aoa_to_sheet(week1Grid);
                
                // Об'єднуємо клітинки для заголовка (A1:F1)
                if (!ws1['!merges']) ws1['!merges'] = [];
                ws1['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }); // Рядок 0, колонки 0-5
                
                // Об'єднуємо клітинки для дати (A2:F2)
                ws1['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
                
                // Встановлюємо ширину колонок
                ws1['!cols'] = [
                    { wch: 10 },  // Номер пари
                    { wch: 25 },  // Понеділок
                    { wch: 25 },  // Вівторок
                    { wch: 25 },  // Середа
                    { wch: 25 },  // Четвер
                    { wch: 25 }   // П'ятниця
                ];
                
                // Застосовуємо стилі
                applyExcelStyles(ws1, week1Grid);
                
                // Налаштування друку та закріплення для Тижня I
                setupPageSettings(ws1);
                
                XLSX.utils.book_append_sheet(wb, ws1, 'Тиждень I');
                
                // ========== АРКУШ 2: Тиждень II ==========
                const week2Grid = createWeekGrid(2);
                const ws2 = XLSX.utils.aoa_to_sheet(week2Grid);
                
                // Об'єднуємо клітинки для заголовка та дати
                if (!ws2['!merges']) ws2['!merges'] = [];
                ws2['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });
                ws2['!merges'].push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });
                
                ws2['!cols'] = [
                    { wch: 10 },
                    { wch: 25 },
                    { wch: 25 },
                    { wch: 25 },
                    { wch: 25 },
                    { wch: 25 }
                ];
                
                // Застосовуємо стилі
                applyExcelStyles(ws2, week2Grid);
                
                // Налаштування друку та закріплення для Тижня II
                setupPageSettings(ws2);
                
                XLSX.utils.book_append_sheet(wb, ws2, 'Тиждень II');
                
                // Зберігаємо файл
                const date = new Date().toISOString().split('T')[0];
                XLSX.writeFile(wb, `Розклад_МІТ_${date}.xlsx`);
                
            } catch (error) {
                console.error('Помилка експорту в Excel:', error);
                customAlert('Помилка при створенні Excel файлу: ' + error.message, 'Помилка', 'error');
            }
        }
        
        /**
         * Застосовує стилі до Excel аркушу
         */
        function applyExcelStyles(ws, grid) {
            const range = XLSX.utils.decode_range(ws['!ref']);
            
            // Кольори
            const headerBg = { rgb: "D4BF9F" };
            const headerText = { rgb: "3D3020" };
            const dataBg = { rgb: "FFFFFF" };
            const dataText = { rgb: "5C4D3D" };
            const borderColor = { rgb: "D4BF9F" };
            
            const thinBorder = {
                style: "thin",
                color: borderColor
            };
            
            const mediumBorder = {
                style: "medium",
                color: { rgb: "B8956A" }
            };
            
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[cellAddress]) continue;
                    
                    const cell = ws[cellAddress];
                    
                    // Базові стилі
                    cell.s = {
                        alignment: { 
                            vertical: 'top', 
                            horizontal: 'left',
                            wrapText: true
                        },
                        border: {
                            top: thinBorder,
                            bottom: thinBorder,
                            left: thinBorder,
                            right: thinBorder
                        }
                    };
                    
                    // Заголовок (рядок 0)
                    if (R === 0) {
                        cell.s.fill = { fgColor: headerBg };
                        cell.s.font = { bold: true, sz: 14, color: headerText };
                        cell.s.alignment.horizontal = 'center';
                    }
                    // Дата (рядок 1)
                    else if (R === 1) {
                        cell.s.font = { sz: 10, color: dataText };
                        cell.s.alignment.horizontal = 'center';
                    }
                    // Шапка таблиці (рядок 3)
                    else if (R === 3) {
                        cell.s.fill = { fgColor: headerBg };
                        cell.s.font = { bold: true, sz: 11, color: headerText };
                        cell.s.alignment.horizontal = 'center';
                        cell.s.border = {
                            top: mediumBorder,
                            bottom: mediumBorder,
                            left: mediumBorder,
                            right: mediumBorder
                        };
                    }
                    // Дані (рядки 4+)
                    else if (R >= 4) {
                        cell.s.fill = { fgColor: dataBg };
                        cell.s.font = { sz: 9, color: dataText };
                        
                        // Перша колонка (номер пари) - центрувати
                        if (C === 0) {
                            cell.s.font.bold = true;
                            cell.s.alignment.horizontal = 'center';
                            cell.s.border.right = mediumBorder;
                        }
                        
                        // Товсті бордери
                        cell.s.border.top = mediumBorder;
                        cell.s.border.left = mediumBorder;
                    }
                }
            }
        }
        
        /**
         * Налаштовує параметри сторінки для друку та закріплення рядків
         */
        function setupPageSettings(ws) {
            // Закріплення верхніх 4 рядків (рядки 0-3: заголовок, дата, порожній, шапка таблиці)
            ws['!freeze'] = { xSplit: 0, ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft' };
            
            // Налаштування друку
            ws['!printHeader'] = { 
                rows: [0, 3] // Друкувати рядки 0-3 на кожній сторінці
            };
            
            // Налаштування сторінки
            ws['!pageSetup'] = {
                paperSize: 9,           // A4
                orientation: 'portrait', // Книжкова орієнтація
                scale: 100,              // Масштаб 100%
                fitToWidth: 1,           // Вмістити по ширині на 1 сторінку
                fitToHeight: 0,          // Висота не обмежена
                horizontalDpi: 300,      // Роздільна здатність
                verticalDpi: 300
            };
            
            // Поля сторінки (в дюймах: 1,8 см = 0.709 дюйма)
            ws['!margins'] = {
                left: 0.709,    // 1,8 см
                right: 0.709,   // 1,8 см
                top: 0.75,      // ~1,9 см (стандартне)
                bottom: 0.75,   // ~1,9 см (стандартне)
                header: 0.3,
                footer: 0.3
            };
            
            // Вирівнювання по центру горизонтально
            if (!ws['!pageSetup']) ws['!pageSetup'] = {};
            ws['!pageSetup'].horizontalCentered = true;
        }
        
        function createWeekGrid(week) {
            const grid = [];
            
            // Заголовок
            grid.push(['РОЗКЛАД КАФЕДРИ МІТ - ТИЖДЕНЬ ' + (week === 1 ? 'I (Чисельник)' : 'II (Знаменник)')]);
            // Дата створення
            const now = new Date();
            const created = now.toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
            grid.push([`Створено ${created}`]);
            
            grid.push([]); // Порожній рядок
            
            // Шапка таблиці
            grid.push(['', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця']);
            
            // Фільтруємо пари для цього тижня
            const weekLessons = lessons.filter(l => parseInt(l.week) === week);
            
            // Групуємо пари по day-slot
            const grouped = {};
            weekLessons.forEach(l => {
                const key = `${l.day}-${l.slot}`;
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(l);
            });
            
            // Для кожної пари (1-5)
            for (let slot = 1; slot <= 5; slot++) {
                const row = [`${slot} пара`];
                
                // Для кожного дня (1-5: ПН-ПТ)
                for (let day = 1; day <= 5; day++) {
                    const key = `${day}-${slot}`;
                    const lessonsInSlot = grouped[key] || [];
                    
                    if (lessonsInSlot.length === 0) {
                        row.push('');
                    } else {
                        // Формуємо текст для комірки
                        const cellText = lessonsInSlot.map(lesson => {
                            let text = '';
                            text += (lesson.teacher || '-') + '\n';
                            text += (lesson.subject || '') + '\n';
                            text += '(' + (lesson.type || '') + ')\n';
                            text += (lesson.group || '-') + '\n';
                            text += (lesson.room || '-');
                            return text;
                        }).join('\n---\n'); // Роздільник між накладками
                        
                        row.push(cellText);
                    }
                }
                
                grid.push(row);
            }
            
            return grid;
        }
        
        function downloadBackup() { const data = JSON.stringify({ lessons, teachersList, subjectsList, groupsList, roomsList }, null, 2); const blob = new Blob([data], {type: "application/json"}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); }
        function uploadBackup(input) { 
            const file = input.files[0]; 
            if (!file) return; 
            
            const reader = new FileReader(); 
            reader.onload = async function(e) { 
                try { 
                    const data = JSON.parse(e.target.result); 
                    
                    // Відновлюємо уроки
                    lessons = sanitizeData(data.lessons); 
                    
                    // Відновлюємо списки
                    teachersList = data.teachersList || []; 
                    subjectsList = data.subjectsList || []; 
                    groupsList = data.groupsList || []; 
                    roomsList = data.roomsList || []; 
                    
                    // Оновлюємо UI
                    populateDatalists(); 
                    renderLessons(); 
                    
                    // Зберігаємо на сервер
                    await adminSave(); 
                    
                    customAlert('Розклад відновлено та збережено', 'Успішно', 'success'); 
                } catch (err) { 
                    console.error('Upload backup error:', err);
                    customAlert('Помилка завантаження файлу: ' + err.message, 'Помилка', 'error'); 
                } 
            }; 
            reader.readAsText(file); 
        }
        function openNewModal(d, s) { editState = { isNew: true, lessonId: null, day: d, slot: s }; clearForm(); document.getElementById('modalTitle').innerText = 'Нова пара'; document.getElementById('addModal').classList.add('open'); document.getElementById('inputGroup').focus(); }
        function openEditModal(l) { 
            editState = { isNew: false, lessonId: l.id };
            document.getElementById('modalTitle').innerText = 'Редагування';
            document.getElementById('inputGroup').value = l.group;
            document.getElementById('inputSubject').value = l.subject;
            document.getElementById('inputType').value = l.type;
            document.getElementById('inputTeacher').value = l.teacher;
            document.getElementById('inputTeacher2').value = l.teacher2;
            document.getElementById('inputNote').value = l.note;
            
            // Парсимо аудиторію
            const sel = document.getElementById('inputRoomSelect');
            if (l.room && typeof l.room === 'string' && l.room.startsWith('Аудиторія ')) {
                // Це "Аудиторія 201"
                sel.value = 'auditorium';
                const roomNum = l.room.replace('Аудиторія ', '');
                document.getElementById('inputRoomNumber').value = roomNum;
            } else {
                // Це звичайна аудиторія зі списку
                const option = Array.from(sel.options).find(opt => opt.value === l.room);
                if (option) {
                    sel.value = l.room;
                    document.getElementById('inputRoomNumber').value = '';
                } else {
                    // Якщо аудиторії немає в списку, додаємо як "Аудиторія"
                    sel.value = 'auditorium';
                    document.getElementById('inputRoomNumber').value = l.room;
                }
            }
            
            toggleCustomRoom();
            toggleTeacher2();
            document.getElementById('addModal').classList.add('open');
        }
        function saveLesson() { 
            const g = document.getElementById('inputGroup').value;
            const s = document.getElementById('inputSubject').value;
            const t = document.getElementById('inputTeacher').value;
            const t2 = document.getElementById('inputTeacher2').value;
            const note = document.getElementById('inputNote').value;
            const type = document.getElementById('inputType').value;
            
            let r = document.getElementById('inputRoomSelect').value;
            if(r === 'auditorium') {
                const roomNum = document.getElementById('inputRoomNumber').value;
                r = roomNum ? `Аудиторія ${roomNum}` : '';
            } else if (!r || r === '') {
                // Якщо не вибрано аудиторію, залишаємо порожнім
                r = '';
            }
            
            if(!s) { customAlert('Введіть назву'); return; }
            
            if(editState.isNew) {
                lessons.push({ id: 'l'+Date.now(), week: currentWeek, day: editState.day, slot: editState.slot, group: g, subject: s, teacher: t, teacher2: t2, type, room: r, note });
            } else {
                const i = lessons.findIndex(l => l.id === editState.lessonId);
                if(i>-1) Object.assign(lessons[i], { group: g, subject: s, teacher: t, teacher2: t2, type, room: r, note });
            }
            
            updateListsFromLessons();
            triggerAutoSave();
            closeModal();
            renderLessons();
            checkConflicts();
        }
        async function deleteLesson(id, e) { e.stopPropagation(); if(await customConfirm('Видалити?')) { lessons = lessons.filter(l=>l.id!==id); triggerAutoSave(); renderLessons(); checkConflicts(); } }
        
        let duplicateState = {
            active: false,
            sourceLesson: null,
            targetWeek: 1  // За замовчуванням поточний тиждень
        };
        
        function duplicateLesson(id, e) {
            e.stopPropagation();
            const lesson = lessons.find(l => l.id === id);
            if (!lesson) return;
            
            // Зберігаємо дані для дублювання
            duplicateState = {
                active: true,
                sourceLesson: { ...lesson },
                targetWeek: currentWeek  // Спочатку показуємо поточний тиждень
            };
            
            // Вмикаємо режим дублювання
            document.body.classList.add('mode-duplicate');
            
            const panel = document.getElementById('duplicate-panel');
            const titleSpan = document.getElementById('duplicate-lesson-title');
            titleSpan.textContent = lesson.subject;
            panel.classList.add('show');
            
            // Підсвічуємо всі слоти
            highlightSlotsForDuplication(lesson);
        }
        
        function highlightSlotsForDuplication(sourceLesson) {
            // Спочатку прибираємо старе підсвічування
            document.querySelectorAll('.time-slot').forEach(slot => {
                slot.classList.remove('duplicate-available', 'duplicate-conflict');
                slot.onclick = null;
            });
            
            document.querySelectorAll('.time-slot').forEach(slot => {
                const day = parseInt(slot.dataset.day);
                const slotNum = parseInt(slot.dataset.slot);
                const week = duplicateState.targetWeek;
                
                // Перевіряємо конфлікти
                const hasConflict = checkDuplicationConflict(sourceLesson, week, day, slotNum);
                
                if (hasConflict) {
                    slot.classList.add('duplicate-conflict');
                } else {
                    slot.classList.add('duplicate-available');
                }
                
                // Додаємо обробник кліку
                slot.onclick = (e) => {
                    if (!duplicateState.active) return;
                    if (e.target.closest('.lesson-card') || e.target.closest('.add-btn-slot')) return;
                    executeDuplicationToSlot(week, day, slotNum, hasConflict);
                };
            });
        }
        
        function checkDuplicationConflict(sourceLesson, targetWeek, targetDay, targetSlot) {
            // Конфлікт якщо:
            // 1. Та ж група в той же час
            // 2. Той же викладач в той же час
            // 3. Та ж аудиторія в той же час (для лекцій)
            
            const conflicts = lessons.filter(l => 
                parseInt(l.week) === parseInt(targetWeek) && 
                parseInt(l.day) === parseInt(targetDay) && 
                parseInt(l.slot) === parseInt(targetSlot) &&
                l.id !== sourceLesson.id  // Виключаємо саму source lesson з перевірки
            );
            
            for (const existing of conflicts) {
                // Перевірка групи
                if (sourceLesson.group && existing.group === sourceLesson.group) {
                    return { type: 'group', lesson: existing };
                }
                
                // Перевірка викладача
                if (sourceLesson.teacher && 
                    (existing.teacher === sourceLesson.teacher || existing.teacher2 === sourceLesson.teacher)) {
                    return { type: 'teacher', lesson: existing };
                }
                if (sourceLesson.teacher2 && 
                    (existing.teacher === sourceLesson.teacher2 || existing.teacher2 === sourceLesson.teacher2)) {
                    return { type: 'teacher', lesson: existing };
                }
                
                // Перевірка аудиторії (тільки для лекцій)
                if (sourceLesson.type === 'Лекція' && existing.type === 'Лекція' && 
                    sourceLesson.room && existing.room === sourceLesson.room) {
                    return { type: 'room', lesson: existing };
                }
            }
            
            return false;
        }
        
        async function executeDuplicationToSlot(targetWeek, targetDay, targetSlot, conflict) {
            if (!duplicateState.active || !duplicateState.sourceLesson) return;
            
            // Якщо є конфлікт - попереджаємо
            if (conflict) {
                const conflictMessages = {
                    'group': `Конфлікт: Група ${conflict.lesson.group} вже має пару в цей час!\n\n${conflict.lesson.subject} (${conflict.lesson.teacher})\n\nВсе одно додати?`,
                    'teacher': `Конфлікт: Викладач ${conflict.lesson.teacher} вже зайнятий в цей час!\n\n${conflict.lesson.subject} (${conflict.lesson.group})\n\nВсе одно додати?`,
                    'room': `Конфлікт: Аудиторія ${conflict.lesson.room} вже зайнята в цей час!\n\n${conflict.lesson.subject} (${conflict.lesson.teacher})\n\nВсе одно додати?`
                };
                
                const confirmed = await customConfirm(conflictMessages[conflict.type], '⚠️ Попередження про конфлікт', 'Додати', 'Скасувати');
                if (!confirmed) {
                    return;
                }
            }
            
            // Створюємо нову пару
            const newLesson = {
                ...duplicateState.sourceLesson,
                id: 'l' + Date.now() + Math.random(),
                week: targetWeek,
                day: targetDay,
                slot: targetSlot,
                _animating: true  // Позначаємо що анімується
            };
            
            const sourceId = duplicateState.sourceLesson.id;
            const isWeekChange = parseInt(duplicateState.sourceLesson.week) !== parseInt(targetWeek);
            
            lessons.push(newLesson);
            
            if (isWeekChange) {
                // Для дублювання на інший тиждень
                triggerAutoSave();
                cancelDuplication();
                
                // Перемикаємо тиждень вручну
                currentWeek = parseInt(targetWeek);
                document.querySelectorAll('.week-btn').forEach(b => b.classList.remove('active'));
                const weekBtn = document.getElementById(`btn-week-${targetWeek}`);
                if (weekBtn) weekBtn.classList.add('active');
                
                // Рендеримо (пара не з'явиться бо має _animating)
                renderLessons();
                checkConflicts();
                
                // Анімація влету
                await animateLessonFlyIn(newLesson.id, targetDay, targetSlot);
            } else {
                // Для дублювання в межах тижня - анімація з оригіналу
                triggerAutoSave();
                renderLessons();
                checkConflicts();
                cancelDuplication();
                
                await animateLessonDuplicate(sourceId, newLesson.id, targetDay, targetSlot);
            }
        }
        
        function cancelDuplication() {
            duplicateState = { active: false, sourceLesson: null, targetWeek: 1 };
            document.body.classList.remove('mode-duplicate');
            document.getElementById('duplicate-panel').classList.remove('show');
            
            // Прибираємо підсвічування
            document.querySelectorAll('.time-slot').forEach(slot => {
                slot.classList.remove('duplicate-available', 'duplicate-conflict');
                slot.onclick = null;
            });
        }
        
        function showNotification(message) {
            const notif = document.createElement('div');
            notif.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #10b981;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-weight: 600;
                z-index: 10000;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                animation: slideIn 0.3s ease;
            `;
            notif.textContent = message;
            document.body.appendChild(notif);
            
            setTimeout(() => {
                notif.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notif.remove(), 300);
            }, 3000);
        }
        
        function closeModal() { document.getElementById('addModal').classList.remove('open'); }
        function clearForm() { 
            ['inputGroup','inputSubject','inputTeacher','inputTeacher2','inputNote','inputRoomNumber'].forEach(id=>document.getElementById(id).value=''); 
            const roomSelect = document.getElementById('inputRoomSelect');
            roomSelect.selectedIndex = 0; // Вибираємо першу опцію "Оберіть..."
            document.getElementById('inputType').value='Лекція'; 
            toggleCustomRoom(); 
            toggleTeacher2(); 
        }
        function toggleCustomRoom() { document.getElementById('customRoomGroup').style.display = document.getElementById('inputRoomSelect').value === 'auditorium' ? 'block' : 'none'; }
        function toggleTeacher2() { document.getElementById('teacher2Group').style.display = document.getElementById('inputType').value === 'Лабораторна' ? 'block' : 'none'; }
        
        // --- СТАТИСТИКА ---
        let currentStatsTab = 'general';
        
        function switchStatsTab(tab) {
            currentStatsTab = tab;
            document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            renderStats();
        }
        
        function openStats() { 
            document.getElementById('statsWeekNum').innerText = currentWeek === 1 ? 'I' : 'II';
            currentStatsTab = 'general';
            document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.stats-tab').classList.add('active');
            renderStats();
            document.getElementById('statsModal').classList.add('open');
        }
        
        function renderStats() {
            const c = document.getElementById('statsContent');
            const active = lessons.filter(l => parseInt(l.week) === parseInt(currentWeek));
            
            if(!active.length) {
                c.innerHTML = '<div style="text-align:center;color:gray;padding:2rem;">Немає пар на цьому тижні</div>';
                return;
            }
            
            if(currentStatsTab === 'general') {
                c.innerHTML = generateGeneralStats(active);
            } else if(currentStatsTab === 'teachers') {
                c.innerHTML = generateTeachersStats(active);
            } else if(currentStatsTab === 'rooms') {
                c.innerHTML = generateRoomsStats(active);
            }
        }
        
        function generateGeneralStats(active) {
            const allLessons = lessons; // Для порівняння тижнів
            const week1 = allLessons.filter(l => parseInt(l.week) === 1);
            const week2 = allLessons.filter(l => parseInt(l.week) === 2);
            
            // Загальна статистика
            const totalHours = active.length * 2; // Кожна пара = 2 год
            const uniqueGroups = [...new Set(active.map(l => l.group))].filter(g => g);
            const uniqueTeachers = [...new Set(active.flatMap(l => [l.teacher, l.teacher2].filter(t => t)))];
            
            // Розподіл по днях
            const dc = {1:0,2:0,3:0,4:0,5:0};
            active.forEach(l => dc[l.day]++);
            const maxD = Math.max(...Object.values(dc)) || 1;
            
            // Порожні слоти
            const emptySlots = {};
            [1,2,3,4,5].forEach(day => {
                emptySlots[day] = [];
                [1,2,3,4,5].forEach(slot => {
                    if(!active.some(l => l.day === day && l.slot === slot)) {
                        emptySlots[day].push(slot);
                    }
                });
            });
            
            // Завантаженість груп
            const groupLoads = {};
            active.forEach(l => {
                if(l.group) {
                    groupLoads[l.group] = (groupLoads[l.group] || 0) + 1;
                }
            });
            const sortedGroups = Object.entries(groupLoads).sort((a,b) => b[1] - a[1]);
            const maxGroupLoad = sortedGroups.length > 0 ? sortedGroups[0][1] : 1;
            
            let html = `
                <!-- Швидкі картки -->
                <div class="stat-cards">
                    <div class="stat-card">
                        <div class="stat-card-value">${active.length}</div>
                        <div class="stat-card-label">Всього пар</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-value">${totalHours.toFixed(1)}</div>
                        <div class="stat-card-label">Годин</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-value">${uniqueGroups.length}</div>
                        <div class="stat-card-label">Груп</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-card-value">${uniqueTeachers.length}</div>
                        <div class="stat-card-label">Викладачів</div>
                    </div>
                </div>
                
                <!-- Розподіл по днях -->
                <div class="stat-section">
                    <div class="stat-title">📊 Розподіл по днях тижня</div>
                    ${['Понеділок','Вівторок','Середа','Четвер',"П'ятниця"].map((d,i) => `
                        <div class="stat-row">
                            <div class="stat-label">${d}</div>
                            <div class="stat-bar-container">
                                <div class="stat-bar bar-blue" style="width:${(dc[i+1]/maxD)*100}%"></div>
                            </div>
                            <div class="stat-value">${dc[i+1]}</div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Порівняння тижнів -->
                <div class="stat-section">
                    <div class="stat-title">⚖️ Порівняння тижнів</div>
                    <div class="stat-row">
                        <div class="stat-label">Тиждень I</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar bar-green" style="width:${week1.length > 0 ? (week1.length/Math.max(week1.length, week2.length)*100) : 0}%"></div>
                        </div>
                        <div class="stat-value">${week1.length}</div>
                    </div>
                    <div class="stat-row">
                        <div class="stat-label">Тиждень II</div>
                        <div class="stat-bar-container">
                            <div class="stat-bar bar-purple" style="width:${week2.length > 0 ? (week2.length/Math.max(week1.length, week2.length)*100) : 0}%"></div>
                        </div>
                        <div class="stat-value">${week2.length}</div>
                    </div>
                    <div class="stat-row">
                        <div class="stat-label" style="color:#64748b;">Різниця</div>
                        <div class="stat-bar-container"></div>
                        <div class="stat-value" style="color:${week1.length === week2.length ? '#10b981' : '#f59e0b'};">
                            ${Math.abs(week1.length - week2.length)}
                        </div>
                    </div>
                </div>
                
                <!-- Завантаженість груп -->
                ${sortedGroups.length > 0 ? `
                <div class="stat-section">
                    <div class="stat-title">👥 Топ-5 найзавантаженіших груп</div>
                    ${sortedGroups.slice(0, 5).map(([group, count]) => `
                        <div class="stat-row">
                            <div class="stat-label">${group}</div>
                            <div class="stat-bar-container">
                                <div class="stat-bar bar-orange" style="width:${(count/maxGroupLoad)*100}%"></div>
                            </div>
                            <div class="stat-value">${count}</div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
                
                <!-- Порожні слоти -->
                <div class="stat-section">
                    <div class="stat-title">⬜ Вільні слоти (можна додати пари)</div>
                    <div class="empty-slots">
                        ${['Пн','Вт','Ср','Чт','Пт'].map((day, i) => `
                            <div class="empty-slot-day">
                                <div class="empty-slot-day-name">${day}</div>
                                <div class="empty-slot-list">
                                    ${emptySlots[i+1].length === 0 ? 
                                        '<div class="empty-slot-item" style="border-style:solid;color:#10b981;border-color:#86efac;">Заповнено</div>' : 
                                        emptySlots[i+1].map(slot => `<div class="empty-slot-item">${slot} пара</div>`).join('')
                                    }
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            
            return html;
        }
        
        function generateTeachersStats(active) {
            // Завантаженість по викладачах
            const teacherLoads = {};
            const teacherDays = {};
            const teacherGroups = {};

            active.forEach(l => {
                [l.teacher, l.teacher2].filter(t => t).forEach(teacher => {
                    teacherLoads[teacher] = (teacherLoads[teacher] || 0) + 1;

                    if(!teacherDays[teacher]) teacherDays[teacher] = {1:0,2:0,3:0,4:0,5:0};
                    teacherDays[teacher][l.day]++;

                    if(!teacherGroups[teacher]) teacherGroups[teacher] = new Set();
                    if(l.group) teacherGroups[teacher].add(l.group);
                });
            });

            const sortedTeachers = Object.entries(teacherLoads).sort((a,b) => b[1] - a[1]);
            const maxLoad = sortedTeachers.length > 0 ? sortedTeachers[0][1] : 1;

            let html = `
                <div class="stat-section">
                    <div class="stat-title">👨‍🏫 Навантаження викладачів (у годинах)</div>
                    ${sortedTeachers.map(([teacher, count]) => `
                        <div class="stat-row">
                            <div class="stat-label" title="${teacher}">${teacher}</div>
                            <div class="stat-bar-container">
                                <div class="stat-bar bar-blue" style="width:${(count/maxLoad)*100}%"></div>
                            </div>
                            <div class="stat-value">${count * 2} год.</div>
                        </div>
                    `).join('')}
                </div>

                ${sortedTeachers.slice(0, 10).map(([teacher, count]) => {
                    const days = teacherDays[teacher];
                    const groups = Array.from(teacherGroups[teacher] || []);
                    const maxDayLoad = Math.max(...Object.values(days));

                    // ВАЖЛИВО: Створюємо безпечне ім'я для кнопки PDF (щоб не ламалось на апострофах)
                    const safeName = teacher.replace(/'/g, "\\'");

                    return `
                    <div class="stat-section">
                        <div class="stat-title" style="display:flex;justify-content:space-between;align-items:center;">
                            <span>📌 ${teacher} (${count} пар, ${count * 2} год)</span>

                            <button class="btn-sync" style="font-size:0.75rem;padding:4px 10px;" onclick="exportTeacherSchedule('${safeName}')">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                        </div>

                        <div style="margin-bottom:1rem;">
                            <div style="font-size:0.8rem;color:#64748b;margin-bottom:0.5rem;font-weight:600;">Завантаженість по днях:</div>
                            ${['Пн','Вт','Ср','Чт','Пт'].map((d,i) => `
                                <div class="stat-row">
                                    <div class="stat-label">${d}</div>
                                    <div class="stat-bar-container">
                                        <div class="stat-bar bar-green" style="width:${days[i+1] > 0 ? (days[i+1]/maxDayLoad)*100 : 0}%"></div>
                                    </div>
                                    <div class="stat-value">${days[i+1] * 2} год.</div>
                                </div>
                            `).join('')}
                        </div>

                        ${groups.length > 0 ? `
                        <div>
                            <div style="font-size:0.8rem;color:#64748b;margin-bottom:0.5rem;font-weight:600;">Групи в роботі (${groups.length}):</div>
                            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                                ${groups.map(g => `<span style="background:#e0f2fe;color:#0369a1;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${g}</span>`).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    `;
                }).join('')}
            `;

            return html;
        }
        
        function generateRoomsStats(active) {
            // Використання аудиторій
            const roomUsage = {};
            const roomTimeSlots = {};
            const roomConflicts = [];
            
            active.forEach(l => {
                if(l.room) {
                    roomUsage[l.room] = (roomUsage[l.room] || 0) + 1;
                    
                    const key = `${l.room}_${l.day}_${l.slot}`;
                    if(!roomTimeSlots[key]) {
                        roomTimeSlots[key] = [];
                    }
                    roomTimeSlots[key].push(l);
                }
            });
            
            // Знаходимо конфлікти (одна аудиторія в один час для кількох груп)
            Object.entries(roomTimeSlots).forEach(([key, lessonsInSlot]) => {
                if(lessonsInSlot.length > 1) {
                    const [room, day, slot] = key.split('_');
                    roomConflicts.push({
                        room,
                        day: parseInt(day),
                        slot: parseInt(slot),
                        lessons: lessonsInSlot
                    });
                }
            });
            
            const sortedRooms = Object.entries(roomUsage).sort((a,b) => b[1] - a[1]);
            const maxRoomUsage = sortedRooms.length > 0 ? sortedRooms[0][1] : 1;
            
            // Пікові години (найбільше завантажені слоти)
            const slotLoads = {};
            active.forEach(l => {
                if(l.room) {
                    const key = `${l.day}_${l.slot}`;
                    slotLoads[key] = (slotLoads[key] || 0) + 1;
                }
            });
            const sortedSlots = Object.entries(slotLoads).sort((a,b) => b[1] - a[1]);
            
            // Вільні аудиторії по часам
            const allRooms = [...new Set(active.map(l => l.room).filter(r => r))];
            const freeRoomsBySlot = {};
            
            [1,2,3,4,5].forEach(day => {
                [1,2,3,4,5].forEach(slot => {
                    const key = `${day}_${slot}`;
                    const usedRooms = active.filter(l => l.day === day && l.slot === slot && l.room).map(l => l.room);
                    const freeRooms = allRooms.filter(r => !usedRooms.includes(r));
                    if(freeRooms.length > 0) {
                        freeRoomsBySlot[key] = freeRooms;
                    }
                });
            });
            
            let html = `
                <!-- Використання аудиторій -->
                <div class="stat-section">
                    <div class="stat-title">🏢 Топ найзавантаженіших аудиторій</div>
                    ${sortedRooms.slice(0, 10).map(([room, count]) => `
                        <div class="stat-row">
                            <div class="stat-label">${room}</div>
                            <div class="stat-bar-container">
                                <div class="stat-bar bar-blue" style="width:${(count/maxRoomUsage)*100}%"></div>
                            </div>
                            <div class="stat-value">${count}</div>
                        </div>
                    `).join('')}
                </div>
                
                <!-- Конфлікти аудиторій -->
                ${roomConflicts.length > 0 ? `
                <div class="stat-section">
                    <div class="stat-title">⚠️ Конфлікти аудиторій (${roomConflicts.length})</div>
                    ${roomConflicts.map(conflict => {
                        const dayName = ['','Пн','Вт','Ср','Чт','Пт'][conflict.day];
                        const timeSlot = TIME_SLOTS[conflict.day][conflict.slot - 1];
                        return `
                        <div class="conflict-item">
                            <div class="conflict-header">
                                🚨 ${conflict.room} — ${dayName}, ${conflict.slot} пара (${timeSlot.time})
                            </div>
                            <div class="conflict-details">
                                ${conflict.lessons.map(l => `• ${l.group || 'Без групи'}: ${l.subject} (${l.teacher})`).join('<br>')}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
                ` : `
                <div class="stat-section">
                    <div class="stat-title">✅ Конфлікти аудиторій</div>
                    <div style="text-align:center;padding:1rem;color:#059669;background:#d1fae5;border-radius:8px;font-weight:600;">
                        Конфліктів не виявлено
                    </div>
                </div>
                `}
                
                <!-- Пікові години -->
                <div class="stat-section">
                    <div class="stat-title">📈 Пікові години (найбільше завантажені)</div>
                    <div class="stat-list">
                        ${sortedSlots.slice(0, 5).map(([key, count]) => {
                            const [day, slot] = key.split('_');
                            const dayName = ['','Пн','Вт','Ср','Чт','Пт'][parseInt(day)];
                            const timeSlot = TIME_SLOTS[parseInt(day)][parseInt(slot) - 1];
                            return `
                            <div class="stat-list-item">
                                <div class="stat-list-icon">${slot}</div>
                                <div class="stat-list-text">${dayName}, ${timeSlot.time}</div>
                                <div class="stat-list-value">${count} ауд.</div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <!-- Вільні аудиторії -->
                ${Object.keys(freeRoomsBySlot).length > 0 ? `
                <div class="stat-section">
                    <div class="stat-title">🆓 Приклади вільних аудиторій</div>
                    <div class="stat-list">
                        ${Object.entries(freeRoomsBySlot).slice(0, 8).map(([key, rooms]) => {
                            const [day, slot] = key.split('_');
                            const dayName = ['','Пн','Вт','Ср','Чт','Пт'][parseInt(day)];
                            const timeSlot = TIME_SLOTS[parseInt(day)][parseInt(slot) - 1];
                            return `
                            <div class="stat-list-item">
                                <div class="stat-list-icon">${slot}</div>
                                <div class="stat-list-text">${dayName}, ${timeSlot.time}</div>
                                <div class="stat-list-value" style="font-size:0.7rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${rooms.join(', ')}">${rooms.slice(0,3).join(', ')}${rooms.length > 3 ? '...' : ''}</div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                ` : ''}
            `;
            
            return html;
        }
        
        function closeStats() { document.getElementById('statsModal').classList.remove('open'); }
        
        function openHelp() {
            document.getElementById('helpModal').classList.add('open');
        }
        
        function closeHelp() {
            document.getElementById('helpModal').classList.remove('open');
        }
        document.addEventListener('keydown', e => { 
            if(e.key==='Escape') { 
                if(duplicateState.active) cancelDuplication(); 
                else if(actionState.active) cancelAction(); 
                else if(highlightState.active) clearHighlight(); 
                else closeModal(); 
                closeStats(); 
            } 
        });

        // --- ЛОГІКА ПЕРСОНАЛЬНИХ ПОСИЛАНЬ ---
        function checkUrlParams() {
            const params = new URLSearchParams(window.location.search);
            const teacherName = params.get('teacher');
            const groupName = params.get('group');

            // Підсвічуємо і на мобільних, і на десктопі
            setTimeout(() => {
                if (teacherName) {
                    // Показуємо кнопку toggle для викладачів (на всіх пристроях)
                        initTeacherToggle(teacherName);
                } else if (groupName) {
                    // Для не-адмінів активуємо тільки на десктопі
                    if (isAdmin || window.innerWidth > 768) {
                        activateHighlight('group', groupName, { stopPropagation: ()=>{} });
                    }
                }
            }, 500);
        }

        // --- ЛОГІКА ДЛЯ TOGGLE МОЇ/ВСІ ПАРИ ---
        let teacherViewMode = 'mine'; // 'mine', 'context', 'all'
        let currentTeacherName = null;

        function initTeacherToggle(teacherName) {
            currentTeacherName = teacherName;
            const toggleBtn = document.getElementById('teacherToggle');
            if (toggleBtn) {
                toggleBtn.style.display = 'inline-flex';
                // Закриваємо синю панель highlight при ініціалізації
                clearHighlight();
                // Застосовуємо фільтр при ініціалізації
                applyTeacherFilter();
            }
            
            // Показуємо кнопку PDF для викладача
            const pdfBtn = document.getElementById('pdfTeacherBtn');
            if (pdfBtn && !isAdmin) {
                pdfBtn.style.display = 'inline-flex';
            }
        }

        function toggleTeacherView() {
            // Циклічне перемикання: mine -> context -> all -> mine
            if (teacherViewMode === 'mine') {
                teacherViewMode = 'context';
            } else if (teacherViewMode === 'context') {
                teacherViewMode = 'all';
            } else {
                teacherViewMode = 'mine';
            }
            
            applyTeacherFilter();
        }
        
        function applyTeacherFilter() {
            if (!currentTeacherName) return;
            
            const cards = document.querySelectorAll('.lesson-card');
            cards.forEach(card => {
                const teacher = card.dataset.teacher;
                const teacher2 = card.dataset.teacher2;
                const isMine = teacher === currentTeacherName || teacher2 === currentTeacherName;
                
                if (teacherViewMode === 'mine') {
                    // Режим "Тільки мої" - показуємо тільки пари викладача
                    if (isMine) {
                        card.style.display = '';
                        card.style.opacity = '1';
                        card.style.filter = 'none';
                    } else {
                        card.style.display = 'none';
                    }
                } else if (teacherViewMode === 'context') {
                    // Режим "Мої на фоні" - свої яскраві, чужі напівпрозорі сірі
                    card.style.display = '';
                    if (isMine) {
                        card.style.opacity = '1';
                        card.style.filter = 'none';
                    } else {
                        card.style.opacity = '0.35';
                        card.style.filter = 'grayscale(0.7)';
                    }
                } else {
                    // Режим "Всі пари" - показуємо все яскраво
                    card.style.display = '';
                    card.style.opacity = '1';
                    card.style.filter = 'none';
                }
            });
        }

        function openLinksModal() {
            const container = document.getElementById('linksListContent');
            container.innerHTML = '';

            if (!teachersList || teachersList.length === 0) {
                container.innerHTML = '<div>Список викладачів порожній. Спочатку завантажте дані.</div>';
            } else {
                const baseUrl = window.location.href.split('?')[0];

                teachersList.forEach(name => {
                    // ВИПРАВЛЕННЯ 1: Замінюємо апостроф на %27 для URL
                    const link = `${baseUrl}?teacher=${encodeURIComponent(name).replace(/'/g, '%27')}`;

                    // ВИПРАВЛЕННЯ 2: Екрануємо апостроф для виклику JS-функції
                    const safeName = name.replace(/'/g, "\\'");

                    const row = document.createElement('div');
                    row.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;";

                    row.innerHTML = `
                        <span style="font-weight:600;">${name}</span>
                        <div style="display:flex;gap:6px;">
                            <button class="btn-sync" style="font-size:0.8rem;" onclick="exportTeacherSchedule('${safeName}')">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </button>
                            <button class="btn-sync" style="font-size:0.8rem;" onclick="copyLink('${link}')">
                                <i class="fa-regular fa-copy"></i> Посилання
                            </button>
                        </div>
                    `;
                    container.appendChild(row);
                });
            }

            document.getElementById('linksModal').classList.add('open');
        }

        function copyLink(text) {
            navigator.clipboard.writeText(text).then(() => {
                customAlert('Посилання скопійовано!', 'Успішно', 'success');
            });
        }


        // --- РОЗШИРЕНИЙ ПОШУК ---
        let advancedSearchFilters = {};
        let advancedSearchFiltersOriginal = {};
        
        function toggleAdvancedSearch() {
            // Перевіряємо чи є активні фільтри
            const hasActiveFilters = Object.keys(advancedSearchFilters).length > 0 && 
                                     Object.values(advancedSearchFilters).some(v => v !== '');
            
            if (hasActiveFilters) {
                // Якщо фільтри активні - скидаємо їх
                resetAdvancedSearch();
                updateFilterButtonState(false);
            } else {
                // Якщо фільтрів немає - відкриваємо модальне вікно
                openAdvancedSearch();
            }
        }
        
        function openAdvancedSearch() {
            document.getElementById('advancedSearchModal').classList.add('open');
        }
        
        function closeAdvancedSearch() {
            document.getElementById('advancedSearchModal').classList.remove('open');
        }
        
        function resetAdvancedSearch() {
            document.getElementById('advSearchTeacher').value = '';
            document.getElementById('advSearchGroup').value = '';
            document.getElementById('advSearchSubject').value = '';
            document.getElementById('advSearchType').value = '';
            document.getElementById('advSearchRoom').value = '';
            document.getElementById('advSearchDay').value = '';
            advancedSearchFilters = {};
            advancedSearchFiltersOriginal = {};
            
            // Приховуємо панель фільтрів
            const panel = document.getElementById('filter-panel');
            if (panel) panel.classList.remove('show');
            
            renderLessons();
        }
        
        function updateFilterButtonState(isActive) {
            const btnAdmin = document.getElementById('filterBtnAdmin');
            
            if (isActive) {
                // Активний стан - жовта кнопка з іншою іконкою
                if (btnAdmin) {
                    btnAdmin.classList.add('btn-filter-active');
                    btnAdmin.innerHTML = '<i class="fa-solid fa-filter-circle-xmark"></i> Скинути';
                    btnAdmin.title = 'Скинути фільтри';
                }
            } else {
                // Неактивний стан - звичайна кнопка
                if (btnAdmin) {
                    btnAdmin.classList.remove('btn-filter-active');
                    btnAdmin.innerHTML = '<i class="fa-solid fa-filter"></i> Фільтри';
                    btnAdmin.title = 'Пошук та фільтри';
                }
            }
        }
        
        function applyAdvancedSearch() {
            // Зберігаємо оригінальні значення для відображення
            const originalValues = {
                teacher: document.getElementById('advSearchTeacher').value.trim(),
                group: document.getElementById('advSearchGroup').value.trim(),
                subject: document.getElementById('advSearchSubject').value.trim(),
                type: document.getElementById('advSearchType').value,
                room: document.getElementById('advSearchRoom').value.trim(),
                day: document.getElementById('advSearchDay').value
            };
            
            console.log('[FILTER DEBUG] originalValues:', originalValues);
            
            // Створюємо фільтри з toLowerCase для пошуку
            const filters = {
                teacher: originalValues.teacher.toLowerCase(),
                group: originalValues.group.toLowerCase(),
                subject: originalValues.subject.toLowerCase(),
                type: originalValues.type,
                room: originalValues.room.toLowerCase(),
                day: originalValues.day
            };
            
            console.log('[FILTER DEBUG] filters:', filters);
            console.log('[FILTER DEBUG] Object.values(filters):', Object.values(filters));
            
            // Перевіряємо чи хоч один фільтр заповнений
            const hasFilters = Object.values(filters).some(v => v !== '');
            
            console.log('[FILTER DEBUG] hasFilters:', hasFilters);
            
            if (!hasFilters) {
                customAlert('Оберіть хоча б один параметр для пошуку!');
                return;
            }
            
            advancedSearchFilters = filters;
            advancedSearchFiltersOriginal = originalValues;
            
            console.log('[FILTER DEBUG] Filters applied, closing modal');
            
            // Очищаємо highlight, якщо він був активний
            if (highlightState.active) {
                highlightState.active = false;
                document.body.classList.remove('spotlight-active');
                document.querySelectorAll('.lesson-card').forEach(c => c.classList.remove('highlighted'));
            }
            
            renderLessons();
            closeAdvancedSearch();
            
            console.log('[FILTER DEBUG] Updating button state');
            
            // Оновлюємо стан кнопки
            updateFilterButtonState(true);
            
            // Показуємо панель з активними фільтрами
            showFilterPanel();
        }
        
        function showFilterPanel() {
            const panel = document.getElementById('filter-panel');
            if (!panel) return;
            
            // Використовуємо оригінальні значення для відображення
            const displayFilters = advancedSearchFiltersOriginal || advancedSearchFilters;
            
            const activeFilters = [];
            if (displayFilters.teacher) activeFilters.push(`Викладач: ${displayFilters.teacher}`);
            if (displayFilters.group) activeFilters.push(`Група: ${displayFilters.group}`);
            if (displayFilters.subject) activeFilters.push(`Предмет: ${displayFilters.subject}`);
            if (displayFilters.type) activeFilters.push(`Тип: ${displayFilters.type}`);
            if (displayFilters.room) activeFilters.push(`Аудиторія: ${displayFilters.room}`);
            if (displayFilters.day) {
                const days = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт'];
                activeFilters.push(`День: ${days[displayFilters.day]}`);
            }
            
            panel.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <i class="fa-solid fa-filter"></i>
                    <strong>Активні фільтри:</strong>
                    ${activeFilters.join(' • ')}
                    <button class="btn-sync" style="margin-left:auto;" onclick="resetAdvancedSearch(); updateFilterButtonState(false);">
                        <i class="fa-solid fa-xmark"></i> Скинути
                    </button>
                </div>
            `;
            panel.classList.add('show');
        }
        
        function matchesAdvancedFilters(lesson) {
            if (Object.keys(advancedSearchFilters).length === 0) return true;
            
            const filters = advancedSearchFilters;
            
            if (filters.teacher) {
                const teacherMatch = (lesson.teacher && typeof lesson.teacher === 'string' && lesson.teacher.toLowerCase().includes(filters.teacher)) ||
                                   (lesson.teacher2 && typeof lesson.teacher2 === 'string' && lesson.teacher2.toLowerCase().includes(filters.teacher));
                if (!teacherMatch) return false;
            }
            
            if (filters.group && (!lesson.group || typeof lesson.group !== 'string' || !lesson.group.toLowerCase().includes(filters.group))) {
                return false;
            }
            
            if (filters.subject && (!lesson.subject || typeof lesson.subject !== 'string' || !lesson.subject.toLowerCase().includes(filters.subject))) {
                return false;
            }
            
            if (filters.type && lesson.type !== filters.type) {
                return false;
            }
            
            if (filters.room && (!lesson.room || typeof lesson.room !== 'string' || !lesson.room.toLowerCase().includes(filters.room))) {
                return false;
            }
            
            if (filters.day && lesson.day !== parseInt(filters.day)) {
                return false;
            }
            
            return true;
        }

        // --- ЕКСПОРТ PDF ДЛЯ ВИКЛАДАЧІВ ---
        function exportCurrentTeacherPDF() {
            // Для гостя - експортуємо поточного викладача або питаємо
            if (currentTeacherName) {
                exportTeacherSchedule(currentTeacherName);
            } else {
                // Якщо не визначено викладача, показуємо список
                const uniqueTeachers = [...new Set(lessons.map(l => l.teacher).filter(t => t))].sort();
                if (uniqueTeachers.length === 0) {
                    customAlert('Немає викладачів у розкладі!');
                    return;
                }
                
                // Простий промпт для вибору
                const teacherName = prompt('Оберіть викладача:\n\n' + uniqueTeachers.join('\n') + '\n\nВведіть прізвище:');
                if (teacherName && uniqueTeachers.includes(teacherName)) {
                    exportTeacherSchedule(teacherName);
                } else if (teacherName) {
                    customAlert('Викладача не знайдено!');
                }
            }
        }
        
        // --- ЕКСПОРТ ПОВНОГО РОЗКЛАДУ КАФЕДРИ (А3) ---
        function exportTeacherSchedule(teacherName) {
            if (!teacherName) {
                teacherName = prompt('Введіть прізвище викладача:');
                if (!teacherName) return;
            }
            
            // Збираємо всі пари викладача
            const teacherLessons = lessons.filter(l => 
                l.teacher === teacherName || l.teacher2 === teacherName
            ).sort((a, b) => {
                if (a.week !== b.week) return a.week - b.week;
                if (a.day !== b.day) return a.day - b.day;
                return a.slot - b.slot;
            });
            
            if (teacherLessons.length === 0) {
                customAlert('Пар для цього викладача не знайдено!');
                return;
            }
            
            // Створюємо HTML для експорту
            const html = generateTeacherScheduleHTML(teacherName, teacherLessons);
            
            // Відкриваємо у новому вікні
            const printWindow = window.open('', '_blank');
            printWindow.document.write(html);
            printWindow.document.close();
        }
        
        function generateTeacherScheduleHTML(teacherName, teacherLessons) {
            const week1 = teacherLessons.filter(l => l.week === 1);
            const week2 = teacherLessons.filter(l => l.week === 2);
            
            const dayNames = ['', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця"];
            
            const generateWeekTable = (lessons, weekNum) => {
                // Групуємо пари по day-slot
                const grouped = {};
                lessons.forEach(l => {
                    const key = `${l.day}-${l.slot}`;
                    if (!grouped[key]) grouped[key] = [];
                    grouped[key].push(l);
                });
                
                // Генеруємо сітку
                let rows = '';
                
                // Для кожної пари (1-5)
                for (let slot = 1; slot <= 5; slot++) {
                    rows += '<tr>';
                    
                    // Колонка з номером пари
                    rows += `<th class="slot-header">${slot} пара</th>`;
                    
                    // Для кожного дня (1-5: ПН-ПТ)
                    for (let day = 1; day <= 5; day++) {
                        const key = `${day}-${slot}`;
                        const lessonsInSlot = grouped[key] || [];
                        
                        if (lessonsInSlot.length === 0) {
                            // Порожня комірка
                            rows += '<td class="empty-cell"></td>';
                        } else {
                            // Є пари в цьому слоті
                            rows += '<td class="lesson-cell">';
                            
                            lessonsInSlot.forEach((lesson, index) => {
                                if (index > 0) {
                                    // Тонка лінія між накладками
                                    rows += '<div class="overlap-divider"></div>';
                                }
                                
                                rows += `
                                    <div class="lesson-item">
                                        <div class="lesson-subject">${lesson.subject}</div>
                                        <div class="lesson-type">(${lesson.type})</div>
                                        <div class="lesson-group">${lesson.group || '-'}</div>
                                        <div class="lesson-room">${lesson.room || '-'}</div>
                                    </div>
                                `;
                            });
                            
                            rows += '</td>';
                        }
                    }
                    
                    rows += '</tr>';
                }
                
                return rows;
            };
            
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Розклад - ${teacherName}</title>
                    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
                    <style>
                        @page {
                            margin: 2cm 1.5cm;
                        }
                        
                        body { 
                            font-family: 'Segoe UI', 'Arial', sans-serif; 
                            margin: 0;
                            padding: 0;
                            font-size: 11pt;
                            line-height: 1.4;
                        }
                        
                        /* Верхній колонтитул */
                        .page-header {
                            border-bottom: 2px solid #b8956a;
                            padding-bottom: 12px;
                            margin-bottom: 25px;
                        }
                        
                        .header-title {
                            font-size: 18pt;
                            font-weight: 700;
                            color: #2d2416;
                            margin: 0 0 8px 0;
                        }
                        
                        .header-info {
                            display: grid;
                            grid-template-columns: auto 1fr;
                            gap: 8px;
                            font-size: 10pt;
                            color: #5c4d3d;
                        }
                        
                        .header-label {
                            font-weight: 600;
                            color: #3d3020;
                        }
                        
                        /* Заголовок тижня */
                        .week-title {
                            font-size: 14pt;
                            font-weight: 700;
                            color: #8b6914;
                            margin: 0 0 15px 0;
                            padding: 8px 12px;
                            background: linear-gradient(135deg, #fef3c7 0%, #fef9e7 100%);
                            border-left: 4px solid #d4a574;
                            border-radius: 4px;
                        }
                        
                        /* Таблиця-сітка */
                        table.schedule-grid { 
                            width: 100%; 
                            border-collapse: collapse; 
                            margin-bottom: 20px;
                            font-size: 9pt;
                            border: 3px solid #333;
                            table-layout: fixed;
                        }
                        
                        /* Заголовки днів */
                        th.day-header { 
                            background: #e8d5b7;
                            color: #3d3020; 
                            padding: 8px 4px;
                            text-align: center;
                            font-weight: 700;
                            border-left: 2px solid #333;
                            border-bottom: 2px solid #333;
                            font-size: 10pt;
                            width: 18%;
                        }
                        
                        th.day-header:first-of-type {
                            border-left: none;
                        }
                        
                        /* Кутова порожня клітинка */
                        th.corner-cell {
                            background: #d4bf9f;
                            border-right: 2px solid #333;
                            border-bottom: 2px solid #333;
                            width: 10%;
                        }
                        
                        /* Заголовки пар (1 пара, 2 пара...) */
                        th.slot-header {
                            background: #e8d5b7;
                            color: #3d3020;
                            padding: 8px;
                            text-align: center;
                            font-weight: 700;
                            border-right: 2px solid #333;
                            border-top: 2px solid #333;
                            font-size: 9pt;
                            width: 10%;
                            vertical-align: middle;
                        }
                        
                        tbody tr:first-child th.slot-header {
                            border-top: none;
                        }
                        
                        /* Комірки з парами */
                        td.lesson-cell,
                        td.empty-cell {
                            padding: 8px 6px;
                            border-left: 2px solid #333;
                            border-top: 2px solid #333;
                            vertical-align: top;
                            min-height: 60px;
                            background: white;
                        }
                        
                        tbody tr:first-child td {
                            border-top: none;
                        }
                        
                        td:first-of-type {
                            border-left: none;
                        }
                        
                        /* Порожні комірки */
                        td.empty-cell {
                            background: white;
                        }
                        
                        /* Елементи пари */
                        .lesson-item {
                            line-height: 1.3;
                        }
                        
                        .lesson-subject {
                            font-weight: 700;
                            font-size: 9pt;
                            color: #2d2416;
                            margin-bottom: 2px;
                        }
                        
                        .lesson-type {
                            font-size: 8pt;
                            color: #666;
                            font-style: italic;
                            margin-bottom: 3px;
                        }
                        
                        .lesson-group {
                            font-size: 8pt;
                            color: #5c4d3d;
                            margin-bottom: 1px;
                        }
                        
                        .lesson-room {
                            font-size: 8pt;
                            color: #5c4d3d;
                            font-weight: 600;
                        }
                        
                        /* Тонкий роздільник між накладками */
                        .overlap-divider {
                            border-top: 1px dotted #999;
                            margin: 6px 0;
                        }
                        
                        
                        /* Підсумки */
                        .summary {
                            margin-top: 15px;
                            padding: 12px 15px;
                            background: #fef9e7;
                            border-radius: 6px;
                            border-left: 4px solid #b8956a;
                            font-size: 10pt;
                            color: #5c4d3d;
                            display: flex;
                            gap: 20px;
                            align-items: center;
                        }
                        
                        .summary-item {
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        }
                        
                        .summary-value {
                            font-weight: 700;
                            color: #3d3020;
                            font-size: 12pt;
                        }
                        
                        /* Контейнер для кнопок */
                        .action-buttons {
                            display: flex;
                            gap: 10px;
                            margin-top: 20px;
                            margin-bottom: 20px;
                            flex-wrap: wrap;
                        }
                        
                        /* Кнопки експорту */
                        .export-btn { 
                            background: white;
                            color: #b8956a;
                            font-size: 11pt;
                            font-weight: 600;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                            transition: all 0.2s;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                        }
                        
                        .export-btn:hover {
                            background: #b8956a;
                            color: white;
                            transform: translateY(-1px);
                            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                        }
                        
                        .export-btn i {
                            font-size: 13pt;
                        }
                        
                        /* Для друку */
                        @media print {
                            .no-print { 
                                display: none; 
                            }
                            
                            /* Кожен тиждень на окремій сторінці */
                            .page-break {
                                page-break-before: always;
                            }
                            
                            body {
                                font-size: 10pt;
                            }
                            
                            table {
                                page-break-inside: auto;
                            }
                            
                            tr {
                                page-break-inside: avoid;
                                page-break-after: auto;
                            }
                        }
                    </style>
                </head>
                <body>
                    <div class="action-buttons no-print">
                        <button class="export-btn" onclick="window.print()">
                            <i class="fa-solid fa-print"></i> Друкувати / Зберегти PDF
                        </button>
                    </div>
                    
                    <!-- Верхній колонтитул з інформацією -->
                    <div class="page-header">
                        <div class="header-title">Розклад занять</div>
                        <div class="header-info">
                            <span class="header-label">Викладач:</span>
                            <span>${teacherName}</span>
                            <span class="header-label">Кафедра:</span>
                            <span>Менеджменту ІТ-сфери</span>
                            <span class="header-label">Дата:</span>
                            <span>${new Date().toLocaleDateString('uk-UA', {year: 'numeric', month: 'long', day: 'numeric'})}</span>
                        </div>
                    </div>
                    
                    <!-- Тиждень I -->
                    <div class="week-title">Тиждень I (чисельник)</div>
                    <table class="schedule-grid">
                        <thead>
                            <tr>
                                <th class="corner-cell"></th>
                                <th class="day-header">ПН</th>
                                <th class="day-header">ВТ</th>
                                <th class="day-header">СР</th>
                                <th class="day-header">ЧТ</th>
                                <th class="day-header">ПТ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${generateWeekTable(week1, 1)}
                        </tbody>
                    </table>
                    
                    <div class="summary">
                        <div class="summary-item">
                            <span>Всього пар:</span>
                            <span class="summary-value">${week1.length}</span>
                        </div>
                    </div>
                    
                    <!-- Тиждень II на новій сторінці -->
                    <div class="page-break"></div>
                    
                    <!-- Повторюємо заголовок для другої сторінки -->
                    <div class="page-header">
                        <div class="header-title">Розклад занять</div>
                        <div class="header-info">
                            <span class="header-label">Викладач:</span>
                            <span>${teacherName}</span>
                            <span class="header-label">Кафедра:</span>
                            <span>Менеджменту ІТ-сфери</span>
                            <span class="header-label">Дата:</span>
                            <span>${new Date().toLocaleDateString('uk-UA', {year: 'numeric', month: 'long', day: 'numeric'})}</span>
                        </div>
                    </div>
                    
                    <div class="week-title">Тиждень II (знаменник)</div>
                    <table class="schedule-grid">
                        <thead>
                            <tr>
                                <th class="corner-cell"></th>
                                <th class="day-header">ПН</th>
                                <th class="day-header">ВТ</th>
                                <th class="day-header">СР</th>
                                <th class="day-header">ЧТ</th>
                                <th class="day-header">ПТ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${generateWeekTable(week2, 2)}
                        </tbody>
                    </table>
                    
                    <div class="summary">
                        <div class="summary-item">
                            <span>Всього пар:</span>
                            <span class="summary-value">${week2.length}</span>
                        </div>
                    </div>
                    
                    <!-- Загальна статистика внизу другої сторінки -->
                    <div class="summary" style="margin-top: 30px; border-left-color: #d4a574;">
                        <div class="summary-item">
                            <span>Загалом за два тижні:</span>
                            <span class="summary-value">${teacherLessons.length}</span>
                        </div>
                    </div>
                </body>
                </html>
            `;
        }
        init();
