globalThis.CRF_CASES=[
  {
    "id": "street",
    "title": "午后街角",
    "subtitle": "街景重建 · 18 个语义对象",
    "kind": "photo",
    "global": "CRF_SCENE_DATA",
    "dataUrl": "assets/scene-data.js",
    "referenceUrl": "assets/reference.png",
    "thumbnail": "downloads/crf_0_5_street_reference.png",
    "selectedId": "signal.main",
    "timeline": {
      "duration": 5,
      "tracks": [
        {
          "id": "$camera",
          "path": "yaw",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 1.6,
              "value": -7
            },
            {
              "time": 3.5,
              "value": 7
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "pitch",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 2.5,
              "value": 2
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "zoom",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 1
            },
            {
              "time": 1.6,
              "value": 1.08
            },
            {
              "time": 3.5,
              "value": 1.08
            },
            {
              "time": 5,
              "value": 1
            }
          ]
        }
      ]
    },
    "description": "从同一组像素高斯函数生成原视角与空间推演。试着更换墙色，或移除信号灯，检查墙面纹理与接缝如何连续。",
    "commands": [
      "把墙改成蓝色",
      "隐藏信号灯",
      "红灯变绿灯"
    ],
    "gallery": [
      {
        "view": "reference",
        "title": "原视角",
        "url": "downloads/crf_0_5_street_reference.png",
        "kind": "reference"
      },
      {
        "view": "left",
        "title": "左侧观察",
        "url": "downloads/crf_0_5_street_left.png",
        "kind": "inferred"
      },
      {
        "view": "right",
        "title": "右侧观察",
        "url": "downloads/crf_0_5_street_right.png",
        "kind": "inferred"
      },
      {
        "view": "elevated",
        "title": "抬高观察",
        "url": "downloads/crf_0_5_street_elevated.png",
        "kind": "inferred"
      }
    ],
    "video": {
      "url": "downloads/crf_0_5_street_5s.mp4",
      "poster": "downloads/crf_0_5_street_reference.png",
      "title": "午后街角 · 5 秒连续运镜"
    }
  },
  {
    "id": "fruit_lab",
    "title": "苹果与梨子",
    "subtitle": "原生函数生成 · 可编辑果形与材质",
    "kind": "procedural",
    "global": "CRF_FRUIT_LAB_DATA",
    "dataUrl": "assets/cases/fruit_lab-data.js",
    "referenceUrl": "assets/cases/fruit_lab-reference.png",
    "thumbnail": "downloads/crf_0_5_fruit_lab_reference.png",
    "selectedId": "apple.main",
    "initialOps": [
      {
        "op": "addPrototype",
        "id": "apple.main",
        "label": "程序生成苹果",
        "prototype": "apple",
        "x": 277,
        "y": 332,
        "width": 278,
        "height": 340,
        "depth": 115
      },
      {
        "op": "set",
        "id": "apple.main",
        "path": "color.amount",
        "value": 0
      },
      {
        "op": "set",
        "id": "apple.main",
        "path": "generator",
        "value": {
          "seed": 17,
          "shape": -0.05,
          "roughness": 0.26
        }
      },
      {
        "op": "addPrototype",
        "id": "pear.main",
        "label": "程序生成梨子",
        "prototype": "pear",
        "x": 534,
        "y": 300,
        "width": 235,
        "height": 404,
        "depth": 70
      },
      {
        "op": "set",
        "id": "pear.main",
        "path": "color.amount",
        "value": 0
      },
      {
        "op": "set",
        "id": "pear.main",
        "path": "generator",
        "value": {
          "seed": 43,
          "shape": 0.15,
          "roughness": 0.43
        }
      }
    ],
    "timeline": {
      "duration": 5,
      "tracks": [
        {
          "id": "$camera",
          "path": "yaw",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 1.6,
              "value": -7
            },
            {
              "time": 3.5,
              "value": 7
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "pitch",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 2.5,
              "value": 2
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "zoom",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 1
            },
            {
              "time": 1.6,
              "value": 1.08
            },
            {
              "time": 3.5,
              "value": 1.08
            },
            {
              "time": 5,
              "value": 1
            }
          ]
        }
      ]
    },
    "description": "几何、果皮、果梗、叶片与接触阴影由代码构造。替换苹果为梨子，调整果形、粗糙度和随机种子，再旋转观察或导出视频。",
    "commands": [
      "把苹果换成梨子",
      "把苹果改成绿色",
      "生成一个苹果"
    ],
    "gallery": [
      {
        "view": "reference",
        "title": "原视角",
        "url": "downloads/crf_0_5_fruit_lab_reference.png",
        "kind": "generated"
      },
      {
        "view": "left",
        "title": "左侧观察",
        "url": "downloads/crf_0_5_fruit_lab_left.png",
        "kind": "generated"
      },
      {
        "view": "right",
        "title": "右侧观察",
        "url": "downloads/crf_0_5_fruit_lab_right.png",
        "kind": "generated"
      },
      {
        "view": "elevated",
        "title": "抬高观察",
        "url": "downloads/crf_0_5_fruit_lab_elevated.png",
        "kind": "generated"
      }
    ],
    "video": {
      "url": "downloads/crf_0_5_fruit_lab_5s.mp4",
      "poster": "downloads/crf_0_5_fruit_lab_reference.png",
      "title": "函数生成静物 · 5 秒运镜"
    }
  },
  {
    "id": "orchard",
    "title": "苹果与梨子·实拍",
    "subtitle": "独立实拍 · 800 × 600 RGB",
    "kind": "photo",
    "global": "CRF_ORCHARD_DATA",
    "dataUrl": "assets/cases/orchard-data.js",
    "referenceUrl": "assets/cases/orchard-reference.png",
    "thumbnail": "downloads/crf_0_5_orchard_reference.png",
    "selectedId": "apple.photo",
    "timeline": {
      "duration": 5,
      "tracks": [
        {
          "id": "$camera",
          "path": "yaw",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 1.6,
              "value": -7
            },
            {
              "time": 3.5,
              "value": 7
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "pitch",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 2.5,
              "value": 2
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "zoom",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 1
            },
            {
              "time": 1.6,
              "value": 1.08
            },
            {
              "time": 3.5,
              "value": 1.08
            },
            {
              "time": 5,
              "value": 1
            }
          ]
        }
      ]
    },
    "description": "曲面、反光与细密果皮的第二组观测。每个像素先归入苹果、梨子、墙面或桌面，再由对应函数独立求值；照片中的阴影仍保留在桌面观测内。",
    "commands": [
      "把苹果改成绿色",
      "把梨子改成红色",
      "向右看10度"
    ],
    "gallery": [
      {
        "view": "reference",
        "title": "原视角",
        "url": "downloads/crf_0_5_orchard_reference.png",
        "kind": "reference"
      },
      {
        "view": "left",
        "title": "左侧观察",
        "url": "downloads/crf_0_5_orchard_left.png",
        "kind": "inferred"
      },
      {
        "view": "right",
        "title": "右侧观察",
        "url": "downloads/crf_0_5_orchard_right.png",
        "kind": "inferred"
      },
      {
        "view": "elevated",
        "title": "抬高观察",
        "url": "downloads/crf_0_5_orchard_elevated.png",
        "kind": "inferred"
      }
    ],
    "source": {
      "title": "Yves Geissbühler · Apple and pear",
      "url": "https://commons.wikimedia.org/wiki/File:Apple_and_pear.jpg",
      "license": "CC0 1.0"
    }
  },
  {
    "id": "alpine",
    "title": "阿尔卑斯湖畔",
    "subtitle": "独立风景 · 800 × 531 RGB",
    "kind": "photo",
    "global": "CRF_ALPINE_DATA",
    "dataUrl": "assets/cases/alpine-data.js",
    "referenceUrl": "assets/cases/alpine-reference.png",
    "thumbnail": "downloads/crf_0_5_alpine_reference.png",
    "selectedId": "lake.main",
    "timeline": {
      "duration": 5,
      "tracks": [
        {
          "id": "$camera",
          "path": "yaw",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 1.6,
              "value": -7
            },
            {
              "time": 3.5,
              "value": 7
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "pitch",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 0
            },
            {
              "time": 2.5,
              "value": 2
            },
            {
              "time": 5,
              "value": 0
            }
          ]
        },
        {
          "id": "$camera",
          "path": "zoom",
          "interpolation": "smooth",
          "keyframes": [
            {
              "time": 0,
              "value": 1
            },
            {
              "time": 1.6,
              "value": 1.08
            },
            {
              "time": 3.5,
              "value": 1.08
            },
            {
              "time": 5,
              "value": 1
            }
          ]
        }
      ]
    },
    "description": "天空、远山、树林、湖岸、水面与建筑组成六个语义表面。原视角可以逐像素核验；其他视角展示深度假设，倒影仍是已观测的颜色。",
    "commands": [
      "把湖水改成青色",
      "光照暖一点",
      "向右看10度"
    ],
    "gallery": [
      {
        "view": "reference",
        "title": "原视角",
        "url": "downloads/crf_0_5_alpine_reference.png",
        "kind": "reference"
      },
      {
        "view": "left",
        "title": "左侧观察",
        "url": "downloads/crf_0_5_alpine_left.png",
        "kind": "inferred"
      },
      {
        "view": "right",
        "title": "右侧观察",
        "url": "downloads/crf_0_5_alpine_right.png",
        "kind": "inferred"
      },
      {
        "view": "elevated",
        "title": "抬高观察",
        "url": "downloads/crf_0_5_alpine_elevated.png",
        "kind": "inferred"
      }
    ],
    "source": {
      "title": "Taubenflieger68 · Lautersee 2026",
      "url": "https://commons.wikimedia.org/wiki/File:Lautersee_2026.jpg",
      "license": "CC0 1.0"
    }
  }
];
