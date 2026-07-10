// ============================================
// 城市文旅轻漫游 - 交互逻辑
// ============================================

// ---------- 高德地图配置 ----------
const AMAP_KEY = 'c78f6bf35a507cc1750331797edd5386';
const AMAP_SECURITY = 'bba016f28bef27052321816329b4a0af';
window._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY };

// ---------- DOM 元素 ----------
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const mainContent = document.getElementById('mainContent');
const emptyState = document.getElementById('emptyState');
const cityNameEl = document.getElementById('cityName');
const citySloganEl = document.getElementById('citySlogan');
const cityHero = document.getElementById('cityHero');
const weatherBadge = document.getElementById('weatherBadge');
const landmarkTrack = document.getElementById('landmarkTrack');
const carouselDots = document.getElementById('carouselDots');
const foodGrid = document.getElementById('foodGrid');
const routeTimeline = document.getElementById('routeTimeline');
const routeTabs = document.getElementById('routeTabs');
const storiesContainer = document.getElementById('storiesContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

// 地图相关
const mapEl = document.getElementById('cityMap');
const mapLoading = document.getElementById('mapLoading');
const mapHint = document.getElementById('mapHint');

// POI 弹窗
const poiModal = document.getElementById('poiModal');
const poiModalEmoji = document.getElementById('poiModalEmoji');
const poiModalTitle = document.getElementById('poiModalTitle');
const poiModalBody = document.getElementById('poiModalBody');
const poiModalClose = document.getElementById('poiModalClose');

// ---------- 状态 ----------
let currentCity = null;
let currentSlide = 0;
let currentRouteDays = 1;
let autoSlideTimer = null;
let visitedSections = new Set();
let touchStartX = 0;
let touchEndX = 0;

// 地图状态
let amap = null;          // AMap.Map 实例
let amapReady = false;    // AMap JS API 是否就绪
let cityMarker = null;    // 城市中心标记
let cityCenter = null;    // [lng, lat]
let landmarkMarkers = []; // 地标标记
let foodMarkers = [];     // 美食标记
let activeTool = 'reset';
let miniMap = null;       // POI 弹窗里的小地图

// ---------- 初始化 ----------
function init() {
    // 搜索事件
    searchBtn.addEventListener('click', handleSearch);
    cityInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // 热门城市标签
    document.querySelectorAll('.city-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            cityInput.value = tag.dataset.city;
            handleSearch();
        });
    });

    // 轮播按钮
    prevBtn.addEventListener('click', () => changeSlide(-1));
    nextBtn.addEventListener('click', () => changeSlide(1));

    // 轮播触摸滑动
    landmarkTrack.addEventListener('touchstart', handleTouchStart, { passive: true });
    landmarkTrack.addEventListener('touchend', handleTouchEnd, { passive: true });
    landmarkTrack.addEventListener('mousedown', handleMouseDown);
    landmarkTrack.addEventListener('mouseup', handleMouseUp);
    landmarkTrack.addEventListener('mouseleave', handleMouseUp);

    // 路线Tab切换
    routeTabs.addEventListener('click', (e) => {
        if (e.target.classList.contains('route-tab')) {
            document.querySelectorAll('.route-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentRouteDays = parseInt(e.target.dataset.days);
            renderRoute();
        }
    });

    // 导航锚点点击
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(item.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                item.classList.add('active');
            }
        });
    });

    // 滚动监听
    window.addEventListener('scroll', throttle(handleScroll, 100));

    // 键盘左右切换轮播
    document.addEventListener('keydown', (e) => {
        if (!currentCity) return;
        if (e.key === 'ArrowLeft') changeSlide(-1);
        if (e.key === 'ArrowRight') changeSlide(1);
    });

    // 点击空状态也可以触发搜索
    emptyState.addEventListener('click', () => {
        cityInput.focus();
    });

    // 地图工具栏
    document.querySelectorAll('.map-tool').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.map-tool').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTool = btn.dataset.tool;
            handleMapTool(activeTool);
        });
    });

    // POI 弹窗关闭
    poiModalClose.addEventListener('click', closePoiModal);
    poiModal.addEventListener('click', (e) => {
        if (e.target === poiModal) closePoiModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !poiModal.classList.contains('hidden')) closePoiModal();
    });

    // 预热地图 SDK
    loadAMap().catch(err => {
        console.warn('高德地图加载失败：', err);
        mapLoading.textContent = '地图加载失败，请检查网络';
    });
}

// ---------- 加载高德地图 ----------
function loadAMap() {
    if (window.AMap && amapReady) return Promise.resolve(window.AMap);
    return new Promise((resolve, reject) => {
        if (!window.AMapLoader) return reject(new Error('AMapLoader 不存在'));
        window.AMapLoader.load({
            key: AMAP_KEY,
            version: '2.0',
            plugins: ['AMap.Geocoder', 'AMap.PlaceSearch', 'AMap.MoveAnimation', 'AMap.ToolBar', 'AMap.Scale', 'AMap.InfoWindow']
        }).then(AMap => {
            window.AMap = AMap;
            amapReady = true;
            resolve(AMap);
        }).catch(reject);
    });
}

// ---------- 搜索城市 ----------
function handleSearch() {
    const cityName = cityInput.value.trim();
    if (!cityName) {
        shakeElement(cityInput);
        return;
    }

    let matchedCity = null;
    for (const key of Object.keys(cityData)) {
        if (key.includes(cityName) || cityName.includes(key)) {
            matchedCity = key;
            break;
        }
    }

    if (matchedCity) {
        currentCity = cityData[matchedCity];
    } else {
        currentCity = buildDynamicCity(cityName);
    }
    renderAll();
}

// ---------- 动态构建任意城市数据（纯文本，无图片） ----------
function buildDynamicCity(cityName) {
    const gradients = [
        "linear-gradient(135deg, #e8652d, #f59e7b)",
        "linear-gradient(135deg, #c0392b, #e74c3c)",
        "linear-gradient(135deg, #2e7d32, #66bb6a)",
        "linear-gradient(135deg, #1565c0, #42a5f5)",
        "linear-gradient(135deg, #6a1b9a, #ab47bc)",
        "linear-gradient(135deg, #e65100, #ff9800)",
    ];
    const heroEmojis = ["🏙️", "🏯", "🏰", "🏝️", "🌆", "🏔️", "🌉", "🌃"];
    const foodEmojis = ["🍜", "🍲", "🥟", "🍢", "🍖", "🍗", "🥘", "🐟", "🍝", "🍚", "🍰", "🦪"];
    const storyEmojis = ["📜", "🏛️", "🎭", "🎨", "📚", "🏺", "🎪", "🌟"];
    const lmEmojis = ["🏛️", "🏘️", "🌳", "🏰", "🛕", "⛰️", "🏮", "🌉"];

    return {
        name: cityName,
        slogan: `探索${cityName}，发现不一样的精彩`,
        color: gradients[Math.floor(Math.random() * gradients.length)],
        heroEmoji: heroEmojis[Math.floor(Math.random() * heroEmojis.length)],
        weather: { temp: (20 + Math.floor(Math.random() * 16)) + "°C", desc: "适宜出游", icon: "🌤️" },
        landmarks: [
            { name: `${cityName}中心广场`, tag: "城市地标", emoji: lmEmojis[0], building: `${cityName}核心城市广场`, desc: `${cityName}最具代表性的城市中心，汇聚商业、文化与休闲功能。`, image: `https://picsum.photos/seed/${encodeURIComponent(cityName)}1/600/400` },
            { name: `${cityName}老街`, tag: "历史街区", emoji: lmEmojis[1], building: `${cityName}传统历史街区`, desc: `漫步${cityName}老街，感受岁月痕迹与当地独特人文气息。`, image: `https://picsum.photos/seed/${encodeURIComponent(cityName)}2/600/400` },
            { name: `${cityName}公园`, tag: "自然风光", emoji: lmEmojis[2], building: `${cityName}城市中心公园`, desc: `${cityName}的城市绿肺，休闲娱乐亲近自然的理想去处。`, image: `https://picsum.photos/seed/${encodeURIComponent(cityName)}3/600/400` },
            { name: `${cityName}博物馆`, tag: "文化场馆", emoji: lmEmojis[3], building: `${cityName}市立博物馆`, desc: `了解${cityName}历史与文化的最佳窗口，珍藏城市记忆。`, image: `https://picsum.photos/seed/${encodeURIComponent(cityName)}4/600/400` }
        ],
        foods: [
            { name: `${cityName}特色面食`, emoji: foodEmojis[0], desc: `当地最具人气的主食，风味独特`, price: "人均 ¥15-30" },
            { name: `${cityName}烤肉`, emoji: foodEmojis[4], desc: `本地人最爱的聚餐选择，炭火香气四溢`, price: "人均 ¥50-100" },
            { name: `${cityName}小吃拼盘`, emoji: foodEmojis[3], desc: `汇集当地多种特色小吃的经典组合`, price: "人均 ¥20-40" },
            { name: `${cityName}甜品`, emoji: foodEmojis[11], desc: `当地传统甜点，甜而不腻深受喜爱`, price: "人均 ¥10-25" },
            { name: `${cityName}早餐`, emoji: foodEmojis[2], desc: `本地人的传统早餐，开启元气满满一天`, price: "人均 ¥8-20" },
            { name: `${cityName}河鲜/海鲜`, emoji: foodEmojis[7], desc: `新鲜本地水产，简单烹饪即是美味`, price: "人均 ¥60-120" }
        ],
        routes: {
            1: [
                { time: "09:00", title: `${cityName}中心区域`, desc: `从城市核心出发，感受${cityName}现代魅力` },
                { time: "12:00", title: `本地美食街`, desc: `午餐品尝${cityName}地道风味小吃` },
                { time: "14:00", title: `${cityName}公园/景区`, desc: `下午漫步城市绿肺，享受悠闲时光` },
                { time: "18:00", title: `${cityName}夜市/商圈`, desc: `晚餐与购物，体验${cityName}夜生活` }
            ],
            2: [
                { time: "第1天 09:00", title: `${cityName}地标景点`, desc: `打卡${cityName}最著名景点` },
                { time: "第1天 14:00", title: `博物馆/文化场馆`, desc: `深入了解${cityName}历史文化` },
                { time: "第1天 19:00", title: `夜景欣赏`, desc: `欣赏${cityName}最美夜景` },
                { time: "第2天 09:00", title: `近郊自然风光`, desc: `远离喧嚣，亲近大自然` },
                { time: "第2天 15:00", title: `特色街区漫步`, desc: `在老街小巷发现${cityName}惊喜` }
            ],
            3: [
                { time: "第1天", title: `城市核心探索`, desc: `${cityName}中心地标 + 商业区 + 美食街` },
                { time: "第2天", title: `文化深度游`, desc: `博物馆 + 历史街区 + 非遗体验` },
                { time: "第3天", title: `自然风光之旅`, desc: `周边山水景区 + 休闲度假` }
            ]
        },
        stories: [
            { title: `${cityName}的历史渊源`, emoji: storyEmojis[0], excerpt: `${cityName}有着悠久历史，每块砖瓦都承载岁月故事。`, full: `${cityName}是中国魅力城市之一，历经岁月洗礼，形成独特地域文化和城市风貌。从古代驿站、商埠到现代城市，${cityName}见证了中国社会巨大变迁。漫步街头，你能感受历史与现代的完美交融。` },
            { title: `${cityName}的民俗风情`, emoji: storyEmojis[2], excerpt: `独特民俗传统和节日庆典，展现${cityName}人民对生活的热爱。`, full: `${cityName}有多彩民俗文化。每逢传统节日，居民举办各具特色的庆祝活动。代代相传的民俗丰富了精神生活，也成吸引游客的重要文化资源。来${cityName}旅游，不妨选在节庆期间亲身体验最地道民俗风情。` },
            { title: `${cityName}的传奇人物`, emoji: storyEmojis[3], excerpt: `${cityName}人杰地灵，历史上涌现许多杰出人物。`, full: `每个城市都有引以为豪的杰出人物，${cityName}也不例外。这片土地孕育了在政治、文化、艺术、科学等领域做出卓越贡献的人才。他们的精神和成就已成为${cityName}城市精神重要组成部分，激励着一代又一代后来者。` },
            { title: `舌尖上的${cityName}`, emoji: storyEmojis[4], excerpt: `${cityName}美食文化源远流长，独特地理环境造就别具一格饮食风味。`, full: `${cityName}饮食文化是这座城市最具吸引力名片之一。得益于独特地理位置和气候条件，${cityName}出产丰富食材，当地人民创造出了独具特色美食体系。从街头小吃到精致宴席，每道菜都蕴含${cityName}人的生活智慧和对美味追求。来${cityName}，一定要放开味蕾尽情享受这场舌尖盛宴。` }
        ]
    };
}

// ---------- 渲染全部内容 ----------
function renderAll() {
    if (!currentCity) return;

    mainContent.classList.remove('hidden');
    emptyState.classList.add('hidden');

    cityNameEl.textContent = currentCity.name;
    citySloganEl.textContent = currentCity.slogan;
    // 优先使用城市封面图片，如果没有则使用渐变色
    if (currentCity.image) {
        cityHero.style.backgroundImage = `url(${currentCity.image})`;
    } else {
        cityHero.style.backgroundImage = currentCity.color || "linear-gradient(135deg, #e8652d, #f59e7b)";
    }
    // 移除旧 emoji，添加新的大号 emoji
    const oldEmoji = cityHero.querySelector('.hero-emoji');
    if (oldEmoji) oldEmoji.remove();
    const emojiEl = document.createElement('div');
    emojiEl.className = 'hero-emoji';
    emojiEl.textContent = currentCity.heroEmoji || "🏙️";
    cityHero.appendChild(emojiEl);

    // 天气接口
    fetchWeather(currentCity.name);

    currentSlide = 0;
    currentRouteDays = 1;
    visitedSections = new Set();
    document.querySelectorAll('.route-tab').forEach((t, i) => {
        t.classList.toggle('active', i === 0);
    });

    // 默认激活第一个工具按钮
    document.querySelectorAll('.map-tool').forEach((b, i) => {
        b.classList.toggle('active', b.dataset.tool === 'reset');
    });
    activeTool = 'reset';

    renderLandmarks();
    renderFood();
    renderRoute();
    renderStories();
    updateRoamProgress();

    document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
    startAutoSlide();

    // 加载地图
    ensureMapForCity(currentCity.name);
}

// ---------- 天气查询（高德） ----------
function fetchWeather(cityName) {
    const fallback = currentCity && currentCity.weather ? currentCity.weather : { temp: '--', desc: '查询中…', icon: '🌤️' };
    weatherBadge.innerHTML = `<span>${fallback.icon} ${fallback.temp}</span><span>${fallback.desc}</span>`;

    // 通过 REST 代理调用（高德 Web API 不支持浏览器直连 CORS），这里用 JSONP：restapi/weather/weatherInfo?city=...&callback=...
    const cbName = '__amap_weather_cb_' + Date.now();
    window[cbName] = function (data) {
        try {
            if (data && data.lives && data.lives[0]) {
                const w = data.lives[0];
                const desc = w.weather || '适宜出游';
                const temp = w.temperature || fallback.temp;
                const icon = mapWeatherIcon(desc);
                weatherBadge.innerHTML = `<span>${icon} ${temp}°C</span><span>${desc}</span>`;
            }
        } catch (e) { /* 静默失败 */ }
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        document.getElementById('weather-js')?.remove();
    };
    const s = document.createElement('script');
    s.id = 'weather-js';
    s.src = `https://restapi.amap.com/v3/weather/weatherInfo?city=${encodeURIComponent(cityName)}&extensions=base&output=JSON&key=${AMAP_KEY}&callback=${cbName}`;
    s.onerror = () => {
        document.getElementById('weather-js')?.remove();
    };
    document.body.appendChild(s);
    setTimeout(() => {
        if (document.getElementById('weather-js')) document.getElementById('weather-js').remove();
    }, 6000);
}

function mapWeatherIcon(desc) {
    if (!desc) return '🌤️';
    if (desc.includes('晴')) return '☀️';
    if (desc.includes('多云')) return '⛅';
    if (desc.includes('阴')) return '☁️';
    if (desc.includes('雨')) return '🌧️';
    if (desc.includes('雪')) return '❄️';
    if (desc.includes('雷')) return '⛈️';
    if (desc.includes('雾') || desc.includes('霾')) return '🌫️';
    return '🌤️';
}

// ---------- 地图：加载与初始化 ----------
async function ensureMapForCity(cityName) {
    try {
        mapLoading.style.display = 'flex';
        const AMap = await loadAMap();

        // 地理编码：城市名 -> 经纬度
        const center = await geocodeCity(cityName);
        cityCenter = center;
        if (!center) {
            mapLoading.textContent = `未找到「${cityName}」的位置，请检查 Key 与城市名`;
            return;
        }

        if (!amap) {
            amap = new AMap.Map('cityMap', {
                zoom: 11,
                center: center,
                viewMode: '2D',
                mapStyle: 'amap://styles/normal'
            });
            // 工具条与比例尺
            AMap.plugin(['AMap.ToolBar', 'AMap.Scale'], () => {
                amap.addControl(new AMap.ToolBar({ position: 'RB' }));
                amap.addControl(new AMap.Scale());
            });
        } else {
            amap.setCenter(center);
        }
        mapLoading.style.display = 'none';

        // 中心标记
        if (cityMarker) amap.remove(cityMarker);
        cityMarker = new AMap.Marker({
            position: center,
            title: cityName,
            content: `<div class="city-center-marker">${cityName}</div>`,
            offset: new AMap.Pixel(-30, -32),
            zIndex: 200
        });
        amap.add(cityMarker);

        // 标记地标
        await searchAndMarkLandmarks(cityName, AMap);
        // 标记美食
        await searchAndMarkFoods(cityName, AMap);

        // 自适应显示
        fitToMarkers();

        // 启用复位按钮
        document.querySelector('.map-tool[data-tool="reset"]').classList.add('active');
        activeTool = 'reset';

    } catch (err) {
        console.error(err);
        mapLoading.textContent = '地图加载失败：' + (err.message || err);
    }
}

function geocodeCity(cityName) {
    return new Promise(resolve => {
        if (!window.AMap) return resolve(null);
        const AMap = window.AMap;
        AMap.plugin('AMap.Geocoder', () => {
            const geo = new AMap.Geocoder({ city: cityName, radius: 1000 });
            geo.getLocation(cityName, (status, result) => {
                if (status === 'complete' && result.geocodes && result.geocodes[0]) {
                    const loc = result.geocodes[0].location;
                    resolve([loc.lng, loc.lat]);
                } else {
                    resolve(null);
                }
            });
        });
    });
}

// ---------- 地标搜索与标记 ----------
async function searchAndMarkLandmarks(cityName, AMap) {
    clearMarkers(landmarkMarkers);
    const placeSearch = new AMap.PlaceSearch({
        city: cityName,
        citylimit: true,
        pageSize: 20,
        extensions: 'all'
    });
    const queryList = (currentCity.landmarks || []).map(l => l.name);

    for (const name of queryList) {
        try {
            const poi = await searchOne(placeSearch, name);
            if (poi) {
                const lm = currentCity.landmarks.find(l => l.name === name);
                const marker = new AMap.Marker({
                    position: poi.location,
                    title: name,
                    content: buildMarkerHtml(lm.emoji || '🏛️', '#e8652d'),
                    offset: new AMap.Pixel(-18, -36),
                    zIndex: 150,
                    extData: { type: 'landmark', name, lm }
                });
                marker.on('click', () => openLandmarkModal(lm, poi));
                amap.add(marker);
                landmarkMarkers.push(marker);
            }
        } catch (e) { /* 跳过单个失败 */ }
    }
    fitToMarkers();
}

async function searchAndMarkFoods(cityName, AMap) {
    clearMarkers(foodMarkers);
    const placeSearch = new AMap.PlaceSearch({
        city: cityName,
        citylimit: true,
        pageSize: 10,
        types: '餐饮服务'
    });
    const queryList = (currentCity.foods || []).map(f => f.name);
    for (const name of queryList) {
        try {
            const poi = await searchOne(placeSearch, name);
            if (poi) {
                const food = currentCity.foods.find(f => f.name === name);
                const marker = new AMap.Marker({
                    position: poi.location,
                    title: name,
                    content: buildMarkerHtml(food.emoji || '🍜', '#f59e0b'),
                    offset: new AMap.Pixel(-18, -36),
                    zIndex: 140,
                    extData: { type: 'food', name, food, poi }
                });
                marker.on('click', () => openFoodModal(food, poi));
                amap.add(marker);
                foodMarkers.push(marker);
            }
        } catch (e) { /* skip */ }
    }
}

function searchOne(placeSearch, keyword) {
    return new Promise((resolve) => {
        placeSearch.search(keyword, (status, result) => {
            if (status === 'complete' && result.poiList && result.poiList.pois && result.poiList.pois[0]) {
                resolve(result.poiList.pois[0]);
            } else {
                resolve(null);
            }
        });
    });
}

function buildMarkerHtml(emoji, color) {
    return `<div class="amap-marker" style="--marker-color:${color}"><span>${emoji}</span></div>`;
}

function clearMarkers(arr) {
    if (!amap) return;
    arr.forEach(m => amap.remove(m));
    arr.length = 0;
}

function fitToMarkers() {
    if (!amap) return;
    const all = [...landmarkMarkers, ...foodMarkers, ...(cityMarker ? [cityMarker] : [])];
    if (all.length === 0) return;
    amap.setFitView(all, false, [80, 80, 80, 80]);
}

// ---------- 地图工具栏 ----------
function handleMapTool(tool) {
    if (!amap) return;
    if (tool === 'reset') {
        if (cityCenter) amap.setCenter(cityCenter);
        fitToMarkers();
    } else if (tool === 'landmarks') {
        if (landmarkMarkers.length) {
            amap.setFitView(landmarkMarkers, false, [80, 80, 80, 80]);
        } else {
            showToast('正在搜索地标…');
        }
    } else if (tool === 'food') {
        if (foodMarkers.length) {
            amap.setFitView(foodMarkers, false, [80, 80, 80, 80]);
        } else {
            showToast('正在搜索美食…');
        }
    } else if (tool === 'route') {
        drawRouteLine();
    }
}

// ---------- 路线绘制 ----------
function drawRouteLine() {
    if (!amap || !window.AMap) return;
    if (landmarkMarkers.length < 2) {
        showToast('地标数据不足，无法绘制路线');
        return;
    }
    // 移除旧线
    if (amap._routeLine) amap.remove(amap._routeLine);

    const path = landmarkMarkers.map(m => m.getPosition());
    amap._routeLine = new window.AMap.Polyline({
        path,
        strokeColor: '#e8652d',
        strokeWeight: 4,
        strokeOpacity: 0.85,
        strokeStyle: 'solid',
        lineJoin: 'round',
        showDir: true
    });
    amap.add(amap._routeLine);
    amap.setFitView([amap._routeLine, ...landmarkMarkers], false, [80, 80, 80, 80]);
    showToast('已绘制地标路线');
}

// ---------- 地标弹窗 ----------
function openLandmarkModal(lm, poi) {
    const addr = poi.address || poi.adname || '';
    const tel = poi.tel || '';
    poiModalEmoji.textContent = lm.emoji || '🏛️';
    poiModalTitle.textContent = lm.name;
    poiModalBody.innerHTML = `
        <div class="poi-row"><span class="poi-label">📍 地址</span><span>${addr || '高德地图已收录'}</span></div>
        ${tel ? `<div class="poi-row"><span class="poi-label">📞 电话</span><span>${tel}</span></div>` : ''}
        <div class="poi-row"><span class="poi-label">🏷️ 标签</span><span>${lm.tag}</span></div>
        <p class="poi-desc">${lm.desc}</p>
        <div id="poiMiniMap" class="poi-mini-map"></div>
        <div class="poi-actions">
            <button class="poi-btn" onclick="openAmapNav(${poi.location.lng},${poi.location.lat},'${poi.name}')">🧭 高德导航</button>
            <button class="poi-btn ghost" onclick="openAmapDetail('${poi.id || ''}')">🗺️ 查看详情</button>
        </div>
    `;
    poiModal.classList.remove('hidden');
    setTimeout(() => renderMiniMap(poi, lm), 60);
}

// ---------- 美食弹窗 ----------
function openFoodModal(food, poi) {
    const addr = poi.address || poi.adname || '';
    poiModalEmoji.textContent = food.emoji || '🍜';
    poiModalTitle.textContent = food.name;
    poiModalBody.innerHTML = `
        <div class="poi-row"><span class="poi-label">📍 地址</span><span>${addr || '高德地图已收录'}</span></div>
        <div class="poi-row"><span class="poi-label">💰 人均</span><span>${food.price}</span></div>
        <p class="poi-desc">${food.desc}</p>
        <div id="poiMiniMap" class="poi-mini-map"></div>
        <div class="poi-actions">
            <button class="poi-btn" onclick="openAmapNav(${poi.location.lng},${poi.location.lat},'${poi.name}')">🧭 立即前往</button>
        </div>
    `;
    poiModal.classList.remove('hidden');
    setTimeout(() => renderMiniMap(poi, food), 60);
}

function renderMiniMap(poi, data) {
    const el = document.getElementById('poiMiniMap');
    if (!el || !window.AMap) return;
    if (miniMap) { try { miniMap.destroy(); } catch (e) {} miniMap = null; }
    miniMap = new window.AMap.Map(el, {
        zoom: 16,
        center: [poi.location.lng, poi.location.lat],
        viewMode: '2D'
    });
    new window.AMap.Marker({
        map: miniMap,
        position: [poi.location.lng, poi.location.lat],
        content: buildMarkerHtml(data.emoji || '📍', '#e8652d')
    });
}

function closePoiModal() {
    poiModal.classList.add('hidden');
    if (miniMap) { try { miniMap.destroy(); } catch (e) {} miniMap = null; }
    poiModalBody.innerHTML = '';
}

// 跳转高德地图 App / Web
window.openAmapNav = function (lng, lat, name) {
    const url = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name || '目的地')}&mode=car&policy=1&src=城市文旅&coordinate=gaode&callnative=1`;
    window.open(url, '_blank');
};
window.openAmapDetail = function (id) {
    if (!id) { showToast('该 POI 无详情 ID'); return; }
    window.open(`https://uri.amap.com/marker?markers=${id}&src=城市文旅&callnative=1`, '_blank');
};

// ---------- 地标轮播 ----------
function renderLandmarks() {
    landmarkTrack.innerHTML = currentCity.landmarks.map((lm, i) => `
        <div class="landmark-card">
            <div class="landmark-placeholder">
                ${lm.image ? `<img class="landmark-img" src="${lm.image}" alt="${lm.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" loading="lazy">` : ''}
                <div class="landmark-img-fallback" style="${lm.image ? 'display:none' : ''}">
                    <span class="landmark-emoji">${lm.emoji || "🏛️"}</span>
                    <h3 class="landmark-name">${lm.name}</h3>
                    ${lm.building ? `<p class="landmark-building">${lm.building}</p>` : ''}
                </div>
                <button class="landmark-locate" data-index="${i}">📍 在地图上查看</button>
            </div>
            <div class="landmark-info">
                <span class="landmark-tag">${lm.tag}</span>
                <p class="landmark-desc">${lm.desc}</p>
            </div>
        </div>
    `).join('');

    // 绑定"在地图上查看"
    landmarkTrack.querySelectorAll('.landmark-locate').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            locateLandmark(idx);
        });
    });

    carouselDots.innerHTML = currentCity.landmarks.map((_, i) => `
        <div class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>
    `).join('');

    carouselDots.querySelectorAll('.carousel-dot').forEach(dot => {
        dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.index)));
    });

    updateCarousel();
}

function locateLandmark(idx) {
    const lm = currentCity.landmarks[idx];
    if (!lm) return;
    // 滚动到地图
    document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
    // 等地图就绪
    if (!amap || !amapReady) {
        showToast('地图正在加载…');
        return;
    }
    // 重新搜索该 POI（避免异步未完成）
    const placeSearch = new window.AMap.PlaceSearch({ city: currentCity.name, citylimit: true, pageSize: 5 });
    placeSearch.search(lm.name, (status, result) => {
        if (status === 'complete' && result.poiList && result.poiList.pois && result.poiList.pois[0]) {
            const poi = result.poiList.pois[0];
            amap.setCenter(poi.location);
            amap.setZoom(15);
            openLandmarkModal(lm, poi);
        } else {
            showToast('未在地图上找到「' + lm.name + '」');
        }
    });
}

function changeSlide(direction) {
    if (!currentCity) return;
    currentSlide = (currentSlide + direction + currentCity.landmarks.length) % currentCity.landmarks.length;
    updateCarousel();
    resetAutoSlide();
}

function goToSlide(index) {
    currentSlide = index;
    updateCarousel();
    resetAutoSlide();
}

function updateCarousel() {
    landmarkTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
    document.querySelectorAll('.carousel-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
    });
}

function startAutoSlide() {
    stopAutoSlide();
    autoSlideTimer = setInterval(() => {
        if (currentCity) {
            currentSlide = (currentSlide + 1) % currentCity.landmarks.length;
            updateCarousel();
        }
    }, 4000);
}

function stopAutoSlide() {
    if (autoSlideTimer) {
        clearInterval(autoSlideTimer);
        autoSlideTimer = null;
    }
}

function resetAutoSlide() {
    stopAutoSlide();
    startAutoSlide();
}

// ---------- 触摸滑动 ----------
function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
    stopAutoSlide();
}

function handleTouchEnd(e) {
    touchEndX = e.changedTouches[0].clientX;
    handleSwipe();
    startAutoSlide();
}

function handleMouseDown(e) {
    touchStartX = e.clientX;
    stopAutoSlide();
}

function handleMouseUp(e) {
    if (touchStartX === 0) return;
    touchEndX = e.clientX;
    handleSwipe();
    touchStartX = 0;
    startAutoSlide();
}

function handleSwipe() {
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
        changeSlide(diff > 0 ? 1 : -1);
    }
}

// ---------- 美食 ----------
function renderFood() {
    foodGrid.innerHTML = currentCity.foods.map(food => `
        <div class="food-card">
            <div class="food-emoji">${food.emoji || "🍜"}</div>
            <div class="food-card-body">
                <h4>${food.name}</h4>
                <p class="food-desc">${food.desc}</p>
                <p class="food-price">${food.price}</p>
            </div>
        </div>
    `).join('');

    // 美食卡片点击动画
    foodGrid.querySelectorAll('.food-card').forEach(card => {
        card.addEventListener('click', function() {
            this.style.transform = 'scale(0.95)';
            setTimeout(() => { this.style.transform = ''; }, 200);
        });
    });
}

// ---------- 打卡路线 ----------
function renderRoute() {
    const routeData = currentCity.routes[currentRouteDays];
    if (!routeData) return;

    routeTimeline.innerHTML = routeData.map((item, i) => `
        <div class="timeline-item" style="animation: fadeInUp 0.4s ${i * 0.1}s both;">
            <div class="timeline-time">${item.time}</div>
            <div class="timeline-title">${item.title}</div>
            <div class="timeline-desc">${item.desc}</div>
        </div>
    `).join('');
}

// ---------- 人文故事 ----------
function renderStories() {
    storiesContainer.innerHTML = currentCity.stories.map(story => `
        <div class="story-card" data-title="${story.title}" data-full="${encodeURIComponent(story.full)}">
            <div class="story-emoji">${story.emoji || "📖"}</div>
            <div class="story-card-body">
                <h4>${story.title}</h4>
                <p class="story-excerpt">${story.excerpt}</p>
                <p class="story-meta">点击阅读全文 →</p>
            </div>
        </div>
    `).join('');

    // 故事卡片点击弹出详情
    storiesContainer.querySelectorAll('.story-card').forEach(card => {
        card.addEventListener('click', () => {
            const title = card.dataset.title;
            const full = decodeURIComponent(card.dataset.full);
            showStoryModal(title, full);
        });
    });
}

// ---------- 故事弹窗 ----------
function showStoryModal(title, content) {
    // 移除已有弹窗
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <div class="modal-header">
                <h3>📖 ${title}</h3>
                <button class="modal-close">✕</button>
            </div>
            <div class="modal-body">${content}</div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 关闭事件
    const closeBtn = overlay.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function escClose(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escClose);
        }
    });
}

// ---------- 滚动监听 ----------
function handleScroll() {
    if (!currentCity) return;

    const sections = ['map', 'landmarks', 'food', 'routes', 'stories'];
    const navItems = document.querySelectorAll('.nav-item');
    const totalSections = 5;

    // 更新导航高亮
    let activeSection = null;
    sections.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 200) {
            activeSection = i;
            visitedSections.add(id);
        }
    });

    if (activeSection !== null) {
        navItems.forEach((item, i) => {
            item.classList.toggle('active', i === activeSection);
        });
    }

    // 更新漫游进度
    updateRoamProgress();
}

function updateRoamProgress() {
    if (!currentCity) return;

    const sections = ['map', 'landmarks', 'food', 'routes', 'stories'];
    let visitedCount = visitedSections.size;

    // 检测可见区域
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            visitedSections.add(id);
        }
    });

    visitedCount = visitedSections.size;
    const progress = Math.round((visitedCount / sections.length) * 100);
    progressFill.style.width = progress + '%';
    progressText.textContent = `漫游进度 ${progress}%`;
}

// ---------- Toast 提示 ----------
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-dark, #2c2c2c);
        color: #fff;
        padding: 12px 24px;
        border-radius: 25px;
        font-size: 0.9rem;
        z-index: 300;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        animation: toastIn 0.3s ease, toastOut 0.3s ease 2.5s forwards;
        pointer-events: none;
    `;

    // 动态注入动画
    if (!document.getElementById('toast-style')) {
        const style = document.createElement('style');
        style.id = 'toast-style';
        style.textContent = `
            @keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
            @keyframes toastOut { from { opacity: 1; transform: translateX(-50%) translateY(0); } to { opacity: 0; transform: translateX(-50%) translateY(-10px); } }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ---------- 抖动动画 ----------
function shakeElement(el) {
    el.style.animation = 'shake 0.5s ease';
    el.addEventListener('animationend', () => {
        el.style.animation = '';
    }, { once: true });
}

// 注入抖动动画
(function injectShakeStyle() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-8px); }
            40% { transform: translateX(8px); }
            60% { transform: translateX(-6px); }
            80% { transform: translateX(6px); }
        }
    `;
    document.head.appendChild(style);
})();

// ---------- 节流工具 ----------
function throttle(fn, delay) {
    let lastTime = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastTime >= delay) {
            lastTime = now;
            fn.apply(this, args);
        }
    };
}

// ---------- 页面可见性切换时暂停/恢复轮播 ----------
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopAutoSlide();
    } else if (currentCity) {
        startAutoSlide();
    }
});

// ---------- 启动 ----------
document.addEventListener('DOMContentLoaded', init);
