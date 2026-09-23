# 画面のつながり

どの画面からどの画面へ行けるかの地図。画面 1 つが `ScreenDef` 1 つで、矢印は「押すと相手の画面が開く
コントロール」を指す。画面の中身は [screen-inventory.md](screen-inventory.md)、スタックと戻る操作の仕組みは
[architecture.md](architecture.md)「画面の登録」が持つ。

シートとダイアログ (エフェクトの選択シート、色の一覧、確認ダイアログ) は画面ではない。スタックに積まず、
開いている画面の上に重なるだけなので、この地図には出てこない。

## 上位の画面

```mermaid
flowchart LR
  RAIL["ツールバーとサイドレール<br>どの画面からも押せる"]
  RAIL --> SETUP[["SETUP GENERAL<br>(setup)"]]:::ref
  RAIL --> SD[["microSD トップメニュー<br>(microsd)"]]:::ref
  RAIL --> MON[["MONITOR トップメニュー<br>(monitor)"]]:::ref
  RAIL --> BANK["(bank-select)"]

  HOME["HOME (Overview)<br>(home)"]
  HOME --> CV[["Channel view<br>(channel-view)"]]:::ref
  HOME --> SENDS["(sends-select)"]
  HOME --> SCENE["SCENE<br>(scene)"]
  SCENE --> SLIST["SCENE LIST<br>(scene.list)"]
  SLIST --> STITLE["(scene.title)"]
  classDef ref fill:#fff6d5,stroke:#b8860b,stroke-width:2px;
```

## チャンネルの画面

```mermaid
flowchart LR
  CV[["Channel view<br>(channel-view)"]]:::ref
  CV --> CHSET["CH SETTING<br>(ch.setting)"]
  CV --> CHIN["INPUT<br>(ch.input)"]
  CV --> GATE["GATE<br>(ch.gate)"]
  CV --> COMP["COMP<br>(ch.comp)"]
  CV --> EQ["EQ<br>(ch.eq)"]
  CV --> DUCK["DUCKER<br>(ch.ducker)"]
  CV --> DLY["DELAY<br>(ch.delay)"]
  CV --> SENDTO["SEND TO<br>(ch.sendto)"]
  CV --> INS["INS FX<br>(ch.insfx)"]
  CV --> FXP["パラメーター設定<br>(ch.effect)"]
  CV --> SSM

  subgraph SSMCS["SSMCS - 丸い矢印で入れ替わる"]
    direction LR
    SSM["SSMCS メイン<br>(ch.ssmcs)"]
    SSC["SSMCS COMP<br>(ch.ssmcs.comp)"]
    SSS["SSMCS COMP Side Chain<br>(ch.ssmcs.sc)"]
    SSE["SSMCS EQ<br>(ch.ssmcs.eq)"]
    SSM --- SSC --- SSS --- SSE
  end
  style SSMCS fill:#f2f2fa,stroke:#9098a8;
  classDef ref fill:#fff6d5,stroke:#b8860b,stroke-width:2px;
```

## SETUP・microSD・MONITOR の下

```mermaid
flowchart LR
  SETUP[["SETUP GENERAL<br>(setup)"]]:::ref
  SETUP --> SMODE["Operation Mode<br>(setup.mode)"]
  SETUP --> SUDK["User Defined Knobs<br>(setup.udk)"]
  SUDK --> SUDKA["(setup.udk.assign)"]
  SETUP --> SRATE["Sampling Frequency<br>(setup.rate)"]
  SETUP --> SPATCH["Output Patch<br>(setup.patch)"]
  SETUP --> SPER["Peripheral<br>(setup.peripheral)"]
  SETUP --> SPOW["Power Management<br>(setup.power)"]
  SETUP --> SDT["Date/Time<br>(setup.datetime)"]
  SDT --> SDTS["(setup.datetime.set)"]
  SDT --> SDTZ["(setup.datetime.zone)"]
  SETUP --> SINT["Software Integration<br>(setup.integration)"]
  SETUP --> SBRI["Brightness<br>(setup.brightness)"]
  SETUP --> SLANG["Language<br>(setup.language)"]
  SETUP --> SVER["Version<br>(setup.version)"]
  SETUP --> SLIC["License<br>(setup.license)"]

  SD[["microSD トップメニュー<br>(microsd)"]]:::ref
  SD --> SDREC["RECORDER<br>(microsd.recorder)"]
  SD --> SDSL["SAVE/LOAD<br>(microsd.saveload)"]
  SD --> SDTOOL["TOOLS<br>(microsd.tools)"]
  SDSL --> SDNAME["(microsd.name)"]
  SDTOOL --> SDNAME

  MON[["MONITOR トップメニュー<br>(monitor)"]]:::ref
  MON --> MLEV["Monitor<br>(monitor.level)"]
  MON --> MPH["Phones<br>(monitor.phones)"]
  MON --> MOSC["Oscillator<br>(monitor.osc)"]
  classDef ref fill:#fff6d5,stroke:#b8860b,stroke-width:2px;
```

## 地図の読み方

- **角に二重線の付いた黄色いノードは、別の図にも出る画面。** その画面から先は図をまたぐ:
  「上位の画面」の Channel view は「チャンネルの画面」へ、SETUP GENERAL・microSD・MONITOR の
  各トップメニューは「SETUP・microSD・MONITOR の下」へ続く。
- **ノードの 1 行目はユーザーガイドの呼び名。** 2 行目の `()` はこのシミュレーターの中での画面 ID。
  ガイドがその画面を名で呼んでいないもの (バンクの一覧・送り先のシート・名前の入力・割り当てのポップアップ) は、
  ID だけを `()` で書く。
- **サイドレールは HOME の直上へ開く。** SETUP・microSD・MONITOR はどの画面からでも開き、そこから
  戻る矢印を 1 回押すと HOME へ帰る (`openTop()`)。ほかの矢印はその画面の上に積む (`push()`)。
- **SSMCS の 4 画面は入れ替わる。** 画面の両端の丸い矢印は積まずに入れ替えるので (`replace()`)、
  どの面から戻ってもチャンネルビューへ 1 回で帰る。チャンネルビューから開くのはメインの面。
- **エフェクトの画面は 2 つの入口を持つ。** インサートはチャンネルビューの INS FX から `ch.insfx` を、
  FX チャンネルはチャンネルビューのパネルから `ch.effect` を開く。どちらもエフェクトの設定画面
  そのもので、触れて開く一段を挟まない。
- **名前の入力は 2 か所から開く。** シーンの名前 (`scene.title`) とカードのフォルダー・ファイルの名前
  (`microsd.name`) は同じ画面の作りで、開いた元へ戻る。
- **チャンネルの画面はストリップを持ち歩く。** ツールバーの左右の矢印がストリップを替えても画面は
  そのままで、そのストリップが持たないブロックの画面は開かない。
