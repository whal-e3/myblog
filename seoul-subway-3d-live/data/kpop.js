/* Seoul K-pop landmarks. Locations are approximate map markers, not building footprints.
 * Place facts come from the linked operators / public tourism agencies. Coordinates
 * are OpenStreetMap contributors' POI/building centers (ODbL): openstreetmap.org/copyright.
 * Models made from these points should be original, schematic forms without logos. */
window.KOREA_KPOP_SITES = {
  meta: {
    asOf: "2026-10-14",
    scope: "Curated public-facing K-pop landmarks in Seoul; not an exhaustive venue list",
    coordinateSource: "OpenStreetMap contributors (ODbL)",
    coordinateLicense: "https://www.openstreetmap.org/copyright",
    projection: { type: "local equirectangular", lat0: 37.53, lon0: 126.98, units: "km" }
  },
  sites: [
    {
      id: "hybe", name: "HYBE headquarters", ko: "하이브 사옥",
      lat: 37.5245773, lon: 126.9642142, category: "agency", shape: "tower",
      address: "42 Hangang-daero, Yongsan-gu, Seoul",
      description: "A well-known fan gathering point outside HYBE's Yongsan headquarters.",
      visit: "View from the public street; the office is not a public attraction.",
      url: "https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=182556",
      coordUrl: "https://www.openstreetmap.org/node/13645042794"
    },
    {
      id: "sm", name: "SM Entertainment", ko: "SM엔터테인먼트",
      lat: 37.5441363, lon: 127.0441508, category: "agency", shape: "tower",
      address: "83-21 Wangsimni-ro, Seongdong-gu, Seoul",
      description: "Seoul Forest headquarters with a first-floor K-pop media display.",
      visit: "Office areas are private; only enter public retail or display spaces when open.",
      url: "https://english.visitkorea.or.kr/svc/contents/contentsView.do?dataSetId=68&menuSn=862&vcontsId=200728",
      coordUrl: "https://www.openstreetmap.org/node/4637864988"
    },
    {
      id: "jyp", name: "JYP Entertainment", ko: "JYP엔터테인먼트",
      lat: 37.5239567, lon: 127.1290738, category: "agency", shape: "tower",
      address: "205 Gangdong-daero, Gangdong-gu, Seoul",
      description: "The JYP Center, an active music production and artist office.",
      visit: "View from the public street; do not enter or wait around private access points.",
      url: "https://www.jype.com/ko/JYP/Contact",
      coordUrl: "https://www.openstreetmap.org/node/5877934885"
    },
    {
      id: "yg", name: "YG Entertainment", ko: "YG엔터테인먼트",
      lat: 37.5489197, lon: 126.9077038, category: "agency", shape: "shell",
      address: "7 Huiujeong-ro 1-gil, Mapo-gu, Seoul",
      description: "The distinct Hapjeong headquarters of a major K-pop label.",
      visit: "View from the public street; the headquarters itself is private.",
      url: "https://www.ygfamily.com/ko/about/introduction",
      coordUrl: "https://www.openstreetmap.org/way/485604177"
    },
    {
      id: "k_star_road", name: "K-Star Road", ko: "한류스타거리",
      lat: 37.5277862, lon: 127.0413251, category: "public_art", shape: "street",
      address: "Apgujeong Rodeo Station area, Gangnam-gu, Seoul",
      description: "Public K-pop-themed walking street known for its GangnamDol art figures.",
      visit: "Open public street; the marker shows the Apgujeong Rodeo end of the route.",
      url: "https://www.visitgangnam.net/en/places/k-star-road-hallyu-flowing-through-the-streets",
      coordUrl: "https://www.openstreetmap.org/node/4416308989"
    },
    {
      id: "coex_kpop_square", name: "COEX K-POP Square", ko: "코엑스 케이팝 스퀘어",
      lat: 37.50997, lon: 127.06134, category: "public_art", shape: "facade",
      address: "513 Yeongdong-daero, Gangnam-gu, Seoul",
      description: "Public plaza beneath the large K-pop and media-art LED facade.",
      visit: "Outdoor public square; screen content changes over time.",
      url: "https://english.visitseoul.net/gangnamarea/COEXK-POPSquare/ENPnj8f9x",
      coordUrl: "https://www.openstreetmap.org/way/74056387"
    },
    {
      id: "hongdae_kpop_square", name: "K-Pop Square Hongdae", ko: "케이팝 스퀘어 홍대",
      lat: 37.5554982, lon: 126.9215255, category: "culture", shape: "facade",
      address: "141 Yanghwa-ro, Mapo-gu, Seoul",
      description: "A K-pop store and rotating artist pop-up space in Hongdae.",
      visit: "Public retail space during posted hours; check the current exhibitions.",
      url: "https://english.visitseoul.net/shopping/K-popSQUARE/ENPet9p1i",
      coordUrl: "https://www.openstreetmap.org/node/12992867534"
    },
    {
      id: "hikr_ground", name: "HiKR Ground", ko: "하이커 그라운드",
      lat: 37.5685333, lon: 126.9815602, category: "culture", shape: "facade",
      address: "40 Cheonggyecheon-ro, Jung-gu, Seoul",
      description: "Korea Tourism Organization experience center with a K-pop XR studio.",
      visit: "Public visitor space; check current floor hours and program availability.",
      url: "https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/rgnContentsView.do?menuSn=351&vcontsId=31124",
      coordUrl: "https://www.openstreetmap.org/node/368898266"
    },
    {
      id: "kbs_hall", name: "KBS Hall", ko: "KBS홀",
      lat: 37.5259532, lon: 126.9152896, category: "broadcast", shape: "hall",
      address: "13 Yeouigongwon-ro, Yeongdeungpo-gu, Seoul",
      description: "Circular performance hall in KBS's Yeouido complex.",
      visit: "View the exterior from public areas; check KBS for event and admission details.",
      url: "https://culture.seoul.go.kr/culture/culture/cultureSpace/view.do?facCode=100282&menuNo=200119",
      coordUrl: "https://www.openstreetmap.org/node/4388013925"
    },
    {
      id: "cj_enm", name: "CJ ENM Center", ko: "CJ ENM 센터",
      lat: 37.5784444, lon: 126.8917277, category: "broadcast", shape: "tower",
      address: "66 Sangamsan-ro, Mapo-gu, Seoul",
      description: "Sangam broadcast center linked with M Countdown production.",
      visit: "Exterior is viewable; broadcasts and studio entry require official access.",
      url: "https://english.visitkorea.or.kr/svc/contents/contentsView.do?dataSetId=68&menuSn=862&vcontsId=200728",
      coordUrl: "https://www.openstreetmap.org/way/691116453"
    },
    {
      id: "mbc_media", name: "MBC Media Center", ko: "MBC 미디어센터",
      lat: 37.5805692, lon: 126.8922332, category: "broadcast", shape: "tower",
      address: "255 Seongam-ro, Mapo-gu, Seoul",
      description: "Sangam broadcast complex associated with Show! Music Core.",
      visit: "Exterior is viewable; broadcasts and studio entry require official access.",
      url: "https://english.visitkorea.or.kr/svc/contents/contentsView.do?dataSetId=68&menuSn=862&vcontsId=200728",
      coordUrl: "https://www.openstreetmap.org/way/691116422"
    }
  ].map(site => ({
    ...site,
    x: +((site.lon - 126.98) * 88.28).toFixed(3),
    z: +((37.53 - site.lat) * 111.32).toFixed(3)
  }))
};
