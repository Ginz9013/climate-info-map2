// DOM
const switchEl = document.getElementById("switch");
const stationsEl = document.getElementById("stations");
const rainfallEl = document.getElementById("rainfall");
const uviEl = document.getElementById("uvi");
const tempEl = document.getElementById("temp");

const rainfallSliderEl = document.querySelector("#rainfallSlider");
const tempSliderEl = document.querySelector("#tempSlider");

// Listener
switchEl.addEventListener("click", () => {
  if (geojsonLayer) {
    map.removeLayer(geojsonLayer);
    geojsonLayer = null;
  } else {
    showTaiwanShape();
  }
});

stationsEl.addEventListener("click", () => {
  deleteSlider();
  StationsInformation();
});

rainfallEl.addEventListener("click", () => {
  deleteSlider();
  rainfallPage(5);
  showRainfallSlider();
});

uviEl.addEventListener("click", () => {
  deleteSlider();
  uviInfoPage();
});

tempEl.addEventListener("click", () => {
  deleteSlider();
  temperaturePage("temp");
  shwoTempSlider();
});

// ---- Leaflet 初始化 ----
const map = L.map("map").setView([23.6978, 120.9605], 8);

const Stadia_AlidadeSmoothDark = L.tileLayer(
  "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
  }
);
Stadia_AlidadeSmoothDark.addTo(map);
// ---- Leaflet 初始化 ----

// ---- Layer ----
let geojsonLayer = null;
let stationMarkers = null;
let heatmapLayer = null;
let uviMapLayer = null;
let tempLayer = null;
// ---- Layer ----

// ---- Global Variable ----
let geoData = null;
let stations = null;
let rainfallInfo = null;
let tempDataList = {};
// ---- Global Variable ----

// ---- ClearLayer ----
function clearLayer() {
  if (stationMarkers) {
    map.removeLayer(stationMarkers);
  }

  if (heatmapLayer) {
    map.removeLayer(heatmapLayer);
  }

  if (uviMapLayer) {
    map.removeLayer(uviMapLayer);
  }

  if (tempLayer) {
    map.removeLayer(tempLayer);
  }
}

// --- 顯示台灣向量輪廓 ---
async function showTaiwanShape() {
  // 取得台灣地形圖資
  const res = await fetch("taiwan.json");
  const data = await res.json();

  // 將 GeoJSON 轉換為 Leaflet 圖層
  geojsonLayer = L.geoJSON(data).addTo(map);

  // 設定圖層樣式（可自行定義）
  geojsonLayer.setStyle({
    color: "white",
    weight: 0.5,
    Opacity: 0.1,
    fillOpacity: 0,
  });
}

// --- 觀測站資訊頁面 ---
async function StationsInformation() {
  // 清除圖層
  clearLayer();

  // --- 取得觀測站資訊 ---
  if (stations === null) {
    const res = await fetch(
      "https://opendata.cwb.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=CWB-0AFFC5D1-340B-437D-8E6E-BFEACCCBB52B"
    );
    const data = await res.json();
    stations = data.records.location;
  }

  // 使用 D3 繪製觀測站位置
  drawObservationStations(stations);

  // 創建一個 D3 繪製函式
  function drawObservationStations(stations) {
    // 在地圖上創建 D3 疊加層
    L.svg().addTo(map);

    stationMarkers = L.layerGroup().addTo(map);

    // 在 Leaflet 地圖上創建 Marker Layer，並將每個觀測站作為標記放置
    stations.forEach((station) => {
      const latlng = new L.LatLng(station.lat, station.lon);

      // Create a Leaflet circle marker for each station
      const circleMarker = L.circleMarker(latlng, {
        radius: 5,
        fillColor: "white",
        fillOpacity: 0.7,
        color: "transparent", // 設定邊線顏色為透明色
      }).addTo(stationMarkers);

      // Using the station information, create the popup content
      const popupContent = `
      <h3>觀測站名： ${station.locationName}</h3>
      <p>測站ID： ${station.stationId}</p>
      <p>觀測時間: ${station.time.obsTime}</p>
      <p>經度: ${station.lon} 緯度: ${station.lat}</p>
    `;

      // Bind the popup to the circle marker
      circleMarker.bindPopup(popupContent);

      // Add event listeners to show/hide the popup on hover
      circleMarker.on("mouseover", function () {
        this.openPopup();
      });

      circleMarker.on("mouseout", function () {
        this.closePopup();
      });
    });
  }

  function update() {
    // 更新地理投影（使用新的地圖縮放和平移）
    projection
      .scale((d3.event.transform.k * 256) / (2 * Math.PI))
      .translate([d3.event.transform.x, d3.event.transform.y]);
  }

  // 當地圖進行縮放或平移時調用更新函式
  map.on("zoomend moveend", update);
  update();
}

// --- 降雨資訊頁面 ---
async function rainfallPage() {
  // 清除圖層
  clearLayer();

  // ---- Leaflet-Heatmap.js ----
  if (rainfallInfo === null) {
    const res = await fetch(
      "https://opendata.cwb.gov.tw/api/v1/rest/datastore/O-A0002-001?Authorization=CWB-0AFFC5D1-340B-437D-8E6E-BFEACCCBB52B&limit=100&parameterName=CITY"
    );
    const data = await res.json();
    rainfallInfo = data.records.location;
  }

  const option = {
    scaleRadius: false,
    radius: 50,
    useLocalExtrema: true,
    latField: "y",
    lngField: "x",
    valueField: "value",
    maxOpacity: 0.5,
  };

  heatmapLayer = new HeatmapOverlay(option);

  updateRainfallData(6);

  heatmapLayer.addTo(map);
}

// ---- 更新降雨資訊 ----
async function updateRainfallData(time) {
  // 重組降雨資料
  let infoArr = rainfallInfo.map((location) => ({
    x: location.lon,
    y: location.lat,
    value: location.weatherElement[time].elementValue,
  }));

  // 渲染地圖
  if (heatmapLayer) {
    heatmapLayer.setData({ max: 100, data: infoArr });
  }
}

// ---- 降雨頁面控制項 ----
function showRainfallSlider() {
  // NoUiSlider.js
  noUiSlider.create(rainfallSliderEl, {
    start: [5],
    step: 1,
    range: {
      min: 0,
      max: 8,
    },
    pips: {
      mode: "values",
      values: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      // [2, 1, 3, 4, 5, 6, 7, 8, 9]
      density: 100,
      format: {
        to: customPipFormatter,
      },
    },
  });

  function customPipFormatter(value) {
    var labels = [
      "10min",
      "60min",
      "3hours",
      "6hours",
      "12hours",
      "24hours",
      "Today",
      "2days",
      "3days",
    ];
    return labels[value];
  }

  rainfallSliderEl.noUiSlider.on("update", function (values, handle) {
    const option = +(+values[handle]).toFixed(0);

    let time = 1;

    if (option === 0) {
      time = 2;
    } else if (option > 1) {
      time = option + 1;
    }

    updateRainfallData(time);
  });
}

// --- 紫外線資訊頁面 ---
async function uviInfoPage() {
  // 清除圖層
  clearLayer();

  // 取得觀測站資料（靜態）
  const stationsRes = await fetch("stations.json");
  const stations = await stationsRes.json();
  const stationList =
    stations.cwbdata.resources.resource.data.stationsStatus.station;

  const res = await fetch(
    "https://opendata.cwb.gov.tw/api/v1/rest/datastore/O-A0005-001?Authorization=CWB-0AFFC5D1-340B-437D-8E6E-BFEACCCBB52B"
  );
  const data = await res.json();
  const uviList = data.records.weatherElement.location;

  let uviData = {};

  uviList.forEach((item) => {
    stationList.forEach((station) => {
      if (item.locationCode === station.StationID) {
        if (uviData[station.CountyName] !== undefined) {
          uviData[station.CountyName] = +(
            (uviData[station.CountyName] + item.value) /
            2
          ).toFixed(2);
        } else {
          uviData[station.CountyName] = item.value;
        }
      }
    });
  });

  const geoRes = await fetch("taiwan.json");
  const geoData = await geoRes.json();

  geoData.features.forEach((feature) => {
    const countyName = feature.properties.NAME_2014;
    const uviValue = uviData[countyName];
    if (uviValue !== undefined) {
      feature.properties.uviValue = uviValue;
    }
  });

  uviMapLayer = L.geoJSON(geoData, {
    style: function (feature) {
      // 根據人口數量來設定顏色
      const uvi = feature.properties.uviValue;
      return {
        fillColor: getColorByUvi(uvi), // 使用自訂函式來取得顏色
        weight: 1,
        color: "white",
        fillOpacity: 0.3,
      };
    },
  }).addTo(map);

  function getColorByUvi(uvi) {
    if (uvi < 3) {
      return "green";
    } else if (uvi < 6) {
      return "orange";
    } else if (uvi < 8) {
      return "brown";
    } else if (uvi < 11) {
      return "red";
    } else {
      return "purple";
    }
  }
}

// ---- 氣溫資訊頁面 ----
async function temperaturePage(prop) {
  // 清除圖層
  clearLayer();

  if (stations === null) {
    const res = await fetch(
      "https://opendata.cwb.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=CWB-0AFFC5D1-340B-437D-8E6E-BFEACCCBB52B"
    );
    const data = await res.json();
    stations = data.records.location;
  }

  // 如果變數為空物件，組各縣市氣溫資料
  if (Object.keys(tempDataList).length === 0) {
    console.log("set");
    stations.forEach((station) => {
      // tempDataList 沒有資料，直接新增
      if (tempDataList[station.parameter[0].parameterValue] === undefined) {
        let countyTemp = {};

        // 現在溫度
        countyTemp.temp =
          +station.weatherElement[3].elementValue === -99
            ? null
            : +station.weatherElement[3].elementValue;

        // 最高溫
        countyTemp.D_TX =
          +station.weatherElement[10].elementValue === -99
            ? null
            : +station.weatherElement[10].elementValue;

        // 最低溫
        countyTemp.D_TN =
          +station.weatherElement[12].elementValue === -99
            ? null
            : +station.weatherElement[12].elementValue;

        tempDataList[station.parameter[0].parameterValue] = countyTemp;
      }
      // tempDataList 已有資料，相加平均
      else {
        let county = tempDataList[station.parameter[0].parameterValue];

        // 現在溫度
        if (
          county.temp !== null &&
          +station.weatherElement[3].elementValue !== -99
        ) {
          county.temp = +(
            (county.temp + +station.weatherElement[3].elementValue) /
            2
          ).toFixed(2);
        } else if (
          county.temp === null &&
          +station.weatherElement[3].elementValue !== -99
        ) {
          county.temp = +station.weatherElement[3].elementValue;
        }

        // 最高溫
        if (
          county.D_TX !== null &&
          +station.weatherElement[10].elementValue !== -99
        ) {
          county.D_TX = +(
            (county.D_TX + +station.weatherElement[10].elementValue) /
            2
          ).toFixed(2);
        } else if (
          county.D_TX === null &&
          +station.weatherElement[10].elementValue !== -99
        ) {
          county.D_TX = +station.weatherElement[10].elementValue;
        }

        // 最低溫
        if (
          county.D_TN !== null &&
          +station.weatherElement[12].elementValue !== -99
        ) {
          county.D_TN = +(
            (county.D_TN + +station.weatherElement[12].elementValue) /
            2
          ).toFixed(2);
        } else if (
          county.D_TN === null &&
          +station.weatherElement[12].elementValue !== -99
        ) {
          county.D_TN = +station.weatherElement[12].elementValue;
        }
      }
    });
  }

  // 取得台灣 GeoData
  if (geoData === null) {
    const geoRes = await fetch("taiwan.json");
    geoData = await geoRes.json();
  }

  // 加入各縣市 GeoData 的屬性
  geoData.features.forEach((feature) => {
    const countyName = feature.properties.NAME_2014;
    const tempValue = tempDataList[countyName].temp;
    const D_TX = tempDataList[countyName].D_TX;
    const D_TN = tempDataList[countyName].D_TN;

    if (tempValue !== undefined) {
      feature.properties.temp = tempValue;
    }

    if (D_TX !== undefined) {
      feature.properties.D_TX = D_TX;
    }

    if (D_TN !== undefined) {
      feature.properties.D_TN = D_TN;
    }
  });

  // 如果已經存在，刪除掉重新綁定
  if (tempLayer) {
    map.removeLayer(tempLayer);
  }

  // 創造圖層並加入 Leaflet
  tempLayer = L.geoJSON(geoData, {
    style: function (feature) {
      // 根據人口數量來設定顏色
      const temp = feature.properties.temp;
      const D_TX = feature.properties.D_TX;
      const D_TN = feature.properties.D_TN;

      return {
        fillColor:
          prop === "temp"
            ? getColorBytemp(temp)
            : prop === "D_TX"
            ? getColorBytemp(D_TX)
            : getColorBytemp(D_TN), // 使用自訂函式來取得顏色
        weight: 1,
        color: "white",
        fillOpacity: 0.3,
      };
    },
  }).addTo(map);

  // 判斷區域顏色的方法
  function getColorBytemp(temp) {
    if (temp <= 9) {
      return "blue";
    } else if (temp <= 18) {
      return "rgb(0, 128, 100)";
    } else if (temp <= 23) {
      return "green";
    } else if (temp <= 26) {
      return "rgb(94, 128, 0)";
    } else if (temp <= 32) {
      return "yellow";
    } else if (temp < +38) {
      return "orange";
    } else {
      return "red";
    }
  }
}

// ---- 氣溫頁面控制項 ----
function shwoTempSlider() {
  // NoUiSlider.js
  noUiSlider.create(tempSliderEl, {
    start: [1],
    step: 1,
    range: {
      min: 0,
      max: 2,
    },
    pips: {
      mode: "values",
      values: [0, 1, 2],
      density: 100,
      format: {
        to: customPipFormatter,
      },
    },
  });

  function customPipFormatter(value) {
    let labels = ["最低溫度", "平均溫度", "最高溫度"];
    return labels[value];
  }

  tempSliderEl.noUiSlider.on("update", function (values, handle) {
    console.log("switch");
    const option = +(+values[handle]).toFixed(0);

    let prop;

    switch (option) {
      case 0:
        prop = "D_TN";
        break;
      case 1:
        prop = "temp";
        break;
      case 2:
        prop = "D_TX";
        break;
    }

    temperaturePage(prop);
  });
}

// ---- 刪除 Slider ----
function deleteSlider() {
  if (rainfallSliderEl.classList.contains("noUi-target")) {
    // 如果包含 noUi-target 类，说明滑块已经创建，可以使用 destroy() 方法销毁
    rainfallSliderEl.noUiSlider.destroy();
    console.log("delete rainfall");
  }

  if (tempSliderEl.classList.contains("noUi-target")) {
    tempSliderEl.noUiSlider.destroy();
    console.log("delete rainfall");
  }
}
