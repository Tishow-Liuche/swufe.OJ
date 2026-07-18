import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// 涓烘瘡绉嶆爣绛剧粍鍚堢敓鎴愭伆褰撶殑瀹屾暣 Markdown 棰橀潰
function generateDescription(title: string, difficulty: string, tags: string[], source: string): string {
  const diffLabel: Record<string, string> = {
    BEGINNER: '鍏ラ棬', POPULAR: '鏅強/鎻愰珮-', IMPROVE: '鎻愰珮+/鐪侀€?', PROVINCIAL: '鐪侀€?, NOI: 'NOI/鐪侀€?, 'POINT_5': 'IOI'
  };
  const diff = diffLabel[difficulty] || difficulty;
  const l = tags;

  if (title === 'A+B Problem' || title.includes('A+B')) {
    return `## 棰樼洰鎻忚堪\n\n杈撳叆涓や釜鏁存暟 $a, b$锛岃緭鍑哄畠浠殑鍜?$(|a|, |b| \\le 10^9)$銆俓n\n## 杈撳叆鏍煎紡\n\n涓や釜鏁存暟锛岀┖鏍煎垎闅斻€俓n\n## 杈撳嚭鏍煎紡\n\n涓€涓暣鏁帮紝鍗?$a+b$ 鐨勫€笺€俓n\n## 鏍蜂緥 #1\n\n杈撳叆锛歕n\n\`\`\`\n1 2\n\`\`\`\n\n杈撳嚭锛歕n\n\`\`\`\n3\n\`\`\`\n\n## 鏍蜂緥 #2\n\n杈撳叆锛歕n\n\`\`\`\n20 30\n\`\`\`\n\n杈撳嚭锛歕n\n\`\`\`\n50\n\`\`\`\n\n## 鎻愮ず\n\n- 闅惧害锛?{diff}\n- 鏍囩锛?{tags.join('銆?)}`;
  }
  if (title.includes('涓ゆ暟涔嬪拰') || title.includes('Hello')) {
    return `## 棰樼洰鎻忚堪\n\n鍩虹鍏ラ棬棰橈紝鑰冨療鍩烘湰鐨勮娉曞拰杈撳叆杈撳嚭銆俓n\n## 杈撳叆鏍煎紡\n\n鏍规嵁棰樼洰瑕佹眰浠庢爣鍑嗚緭鍏ヨ鍙栨暟鎹€俓n\n## 杈撳嚭鏍煎紡\n\n灏嗙粨鏋滆緭鍑哄埌鏍囧噯杈撳嚭銆俓n\n## 鎻愮ず\n\n- 闅惧害锛?{diff}\n- 鏍囩锛?{tags.join('銆?)}`;
  }

  // 鎸夋牳蹇冪畻娉曠煡璇嗙偣鐢熸垚鎻忚堪
  const coreAlgo = tags[0] || '';
  let desc = `## 棰樼洰鎻忚堪\n\n`;

  if (l.includes('鎺掑簭')) desc += `缁欏畾涓€缁勬暟鎹紝璇锋寜鐓ц姹傝繘琛屾帓搴忓苟杈撳嚭缁撴灉銆俓n\n`;
  else if (l.includes('浜屽垎')) desc += `鍦ㄧ粰瀹氱殑鏁版嵁鑼冨洿鍐咃紝浣跨敤浜屽垎鏌ユ壘娉曟壘鍒扮洰鏍囩瓟妗堛€備簩鍒嗘煡鎵剧殑鏍稿績鎬濇兂鏄瘡娆″皢鎼滅储鑼冨洿缂╁皬涓€鍗娿€俓n\n`;
  else if (l.includes('璐績')) desc += `鏈闇€瑕佷綘閲囧彇灞€閮ㄦ渶浼樼瓥鐣ユ潵鑾峰緱鍏ㄥ眬鏈€浼樿В銆俓n\n`;
  else if (l.includes('鍔ㄦ€佽鍒?) || l.includes('鍖洪棿DP')) desc += `鏈闇€瑕侀€氳繃鐘舵€佽浆绉绘柟绋嬫潵鎺ㄥ鏈€浼樼粨鏋溿€傚姩鎬佽鍒掔殑鏍稿績鏄€屾渶浼樺瓙缁撴瀯銆嶄笌銆屾棤鍚庢晥鎬с€嶃€俓n\n`;
  else if (l.includes('鑳屽寘')) desc += `缁忓吀鐨勮儗鍖呴棶棰樺彉浣擄紝瑕佹眰浣犲湪瀹归噺闄愬埗涓嬮€夋嫨鐗╁搧浣垮緱鎬讳环鍊兼渶澶с€俓n\n`;
  else if (l.includes('鍥捐') || l.includes('鏈€鐭矾')) desc += `鍦ㄤ竴涓粰瀹氱殑鍥句腑锛屾眰鍑烘墍闇€鐨勬渶鐭矾寰勬垨鍏朵粬鍥捐闂銆俓n\n`;
  else if (l.includes('DFS') || l.includes('BFS')) desc += `浣跨敤鎼滅储绠楁硶閬嶅巻鐘舵€佺┖闂存潵鎵惧埌闂鐨勮В銆俓n\n`;
  else if (l.includes('骞舵煡闆?)) desc += `缁存姢鑻ュ共涓笉鐩镐氦鐨勯泦鍚堬紝鏀寔鍚堝苟鍜屾煡璇㈡搷浣溿€俓n\n`;
  else if (l.includes('鏍戝舰DP')) desc += `鍦ㄤ竴妫垫爲鐨勭粨鏋勪笂杩涜鍔ㄦ€佽鍒掋€俓n\n`;
  else if (l.includes('鏁版嵁缁撴瀯')) desc += `闇€瑕佷娇鐢ㄥ悎閫傜殑鏁版嵁缁撴瀯鏉ョ淮鎶ゅ拰澶勭悊鏁版嵁銆俓n\n`;
  else if (l.includes('绾挎鏍?)) desc += `绾挎鏍戞槸涓€绉嶄簩鍙夋爲褰㈢粨鏋勶紝鏀寔鍖洪棿淇敼涓庡尯闂存煡璇㈡搷浣溿€俓n\n`;
  else if (l.includes('鏍戠姸鏁扮粍')) desc += `鏍戠姸鏁扮粍锛團enwick Tree锛夋敮鎸佸崟鐐逛慨鏀瑰拰鍓嶇紑鏌ヨ銆俓n\n`;
  else if (l.includes('鏁板')) desc += `鏈涓昏鑰冨療鏁板鎺ㄥ鑳藉姏銆傝浠旂粏鍒嗘瀽闂鑳屽悗鐨勬暟瀛﹀師鐞嗐€俓n\n`;
  else if (l.includes('楂樼簿搴?)) desc += `鏈鐨勬暟鎹寖鍥磋秴鍑轰簡鏍囧噯鏁存暟绫诲瀷鐨勮〃绀鸿寖鍥达紝闇€瑕佷娇鐢ㄩ珮绮惧害锛堝ぇ鏁存暟锛夎繍绠椼€俓n\n`;
  else if (l.includes('瀛楃涓?)) desc += `瀵圭粰瀹氱殑瀛楃涓茶繘琛屾寚瀹氱殑澶勭悊鎴栧尮閰嶆搷浣溿€俓n\n`;
  else if (l.includes('妯℃嫙')) desc += `鎸夌収棰樼洰鎻忚堪鐨勯€昏緫锛岄€愭妯℃嫙鎵ц鍗冲彲寰楀埌绛旀銆俓n\n`;
  else if (l.includes('鏋氫妇')) desc += `鍦ㄧ粰瀹氱殑鏁版嵁鑼冨洿鍐咃紝鏋氫妇鎵€鏈夊彲鑳界殑鎯呭喌杩涜楠岃瘉銆俓n\n`;
  else if (l.includes('閫掓帹') || l.includes('閫掑綊')) desc += `閫氳繃閫掓帹鎴栭€掑綊鐨勬柟寮忥紝閫愭璁＄畻鍑烘渶缁堢粨鏋溿€俓n\n`;
  else if (l.includes('浣嶈繍绠?)) desc += `鍒╃敤浣嶈繍绠楃殑鎶€宸ч珮鏁堣В鍐抽棶棰樸€俓n\n`;
  else if (l.includes('浜屽垎鍥?)) desc += `鍥剧殑涓€涓瓙鍥剧殑椤剁偣鍙互鍒嗕负涓や釜涓嶇浉浜ょ殑瀛愰泦锛屼娇寰楁瘡鏉¤竟鐨勪袱绔垎鍒睘浜庝袱涓瓙闆嗐€俓n\n`;
  else if (l.includes('鎷撴墤鎺掑簭')) desc += `瀵逛竴涓湁鍚戞棤鐜浘锛圖AG锛夎繘琛屾嫇鎵戞帓搴忥紝浠ヨ幏寰楁墍鏈夐《鐐圭殑绾挎€у簭鍒椼€俓n\n`;
  else if (l.includes('鏈€灏忕敓鎴愭爲')) desc += `鍦ㄤ竴涓繛閫氭棤鍚戝浘涓紝鎵惧埌涓€妫靛寘鍚墍鏈夐《鐐圭殑鏍戯紝涓旇竟鐨勬潈閲嶄箣鍜屾渶灏忋€俓n\n`;
  else if (l.includes('缃戠粶娴?) || l.includes('Dinic')) desc += `缃戠粶鏈€澶ф祦闂锛氬湪涓€涓閲忕綉缁滀腑锛屼粠婧愮偣鍒版眹鐐圭殑鏈€澶ф祦鏄灏戯紵\n\n`;
  else if (l.includes('Hash') || l.includes('鍝堝笇')) desc += `鍒╃敤鍝堝笇琛ㄥ疄鐜板揩閫熸煡鎵句笌鍘婚噸銆俓n\n`;
  else if (l.includes('KMP')) desc += `KMP 绠楁硶鐢ㄤ簬鍦ㄦ枃鏈覆涓珮鏁堝尮閰嶆ā寮忓瓧绗︿覆銆俓n\n`;
  else if (l.includes('Tarjan') || l.includes('寮鸿繛閫?)) desc += `浣跨敤 Tarjan 绠楁硶姹傝В寮鸿繛閫氬垎閲忋€俓n\n`;
  else desc += `鏈鏉ヨ嚜娲涜胺棰樺簱锛岃€冨療 ${tags.join('銆?)} 鐩稿叧鐭ヨ瘑銆俓n\n`;

  desc += `## 杈撳叆鏍煎紡\n\n`;
  desc += `浠庢爣鍑嗚緭鍏ヨ鍙栨暟鎹€傚叿浣撴牸寮忚鍙傝€冨師棰樿鏄庛€俓n\n`;
  desc += `## 杈撳嚭鏍煎紡\n\n`;
  desc += `鍚戞爣鍑嗚緭鍑烘墦鍗扮粨鏋溿€俓n\n`;
  desc += `## 鏍蜂緥\n\n`;
  desc += `璇﹁鍘熼閾炬帴銆俓n\n`;
  desc += `## 鎻愮ず\n\n`;
  desc += `- 闅惧害锛?{diff}\n`;
  desc += `- 鏍囩锛?{tags.join('銆?)}\n`;
  if (difficulty === 'POINT_2') desc += `- 鏈鏈変竴瀹氶毦搴︼紝寤鸿鍦ㄦ帉鎻″熀纭€鍚庡皾璇昞n`;
  if (l.includes('楂樼簿搴?)) desc += `- 娉ㄦ剰浣跨敤鏁扮粍鎴栧瓧绗︿覆瀛樺偍澶ф暣鏁癨n`;
  if (difficulty === 'POINT_0') desc += `- 閫傚悎鍒濆鑰呯殑鍩虹棰榎n`;

  return desc;
}

// 鏂板鏇村棰樼洰 (P6000-P9999 鑼冨洿 + 琛ュ厖)
const NEW_PROBLEMS: Array<[string, string, string[]]> = [
  ["P6030 [SDOI2012] 璧拌糠瀹?, "POINT_2", ["鍥捐","鏈€鐭矾","鏈熸湜"]],
  ["P6060 [SCOI2021] 鑲＄エ浜ゆ槗", "POINT_2", ["鍔ㄦ€佽鍒?,"鍗曡皟闃熷垪"]],
  ["P6075 [JSOI2015] 瀛愰泦閫夊彇", "POINT_1", ["鏁板","缁勫悎鏁?]],
  ["P6089 [JSOI2015] 闈炶瘹鍕挎壈", "POINT_2", ["鏁板","鏈熸湜"]],
  ["P6121 [USACO16OPEN] 鍏抽棴鍐滃満", "POINT_1", ["骞舵煡闆?,"绂荤嚎"]],
  ["P6175 鏃犲悜鍥剧殑鏈€灏忕幆闂", "POINT_1", ["鍥捐","鏈€鐭矾","Floyd"]],
  ["P6186 [NOI Online 鎻愰珮缁刔 鍐掓场鎺掑簭", "POINT_2", ["鏍戠姸鏁扮粍","鏁板"]],
  ["P6190 [USACO19DEC] MooBuzz", "POINT_1", ["鏁板","浜屽垎"]],
  ["P6198 [USACO19DEC] Meetings", "POINT_1", ["妯℃嫙","鎺掑簭"]],
  ["P6200 [USACO19FEB] Painting the Barn G", "POINT_1", ["宸垎","鍓嶇紑鍜?]],
  ["P6208 [USACO06OCT] Cow Redistribution", "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P6240 濂藉悆鐨勯鐩?, "POINT_1", ["鍔ㄦ€佽鍒?,"鑳屽寘"]],
  ["P6242 绾挎鏍?2", "POINT_2", ["绾挎鏍?,"鏁版嵁缁撴瀯"]],
  ["P6245 [USACO06OPEN] The Clocks", "POINT_1", ["鎼滅储","鐘跺帇"]],
  ["P6278 [USACO20OPEN] Pile of Stones G", "POINT_1", ["宸垎"]],
  ["P6280 [USACO20FEB] Exercise P", "POINT_2", ["鏁板","鏁拌"]],
  ["P6286 [COCI2016-2017] Go", "POINT_1", ["妯℃嫙"]],
  ["P6323 [COCI2006-2007] 鏈€鐭矾", "POINT_1", ["鍥捐","鏈€鐭矾"]],
  ["P6348 [PA2011] Journeys", "POINT_2", ["鍥捐","绾挎鏍戝缓鍥?]],
  ["P6382 [COCI2018-2019] 鍔犲瘑", "POINT_1", ["瀛楃涓?]],
  ["P6405 [COCI2014-2015] Norma", "POINT_2", ["鍒嗘不"]],
  ["P6462 [COCI2013-2014] 璧涜窇", "POINT_1", ["浜屽垎"]],
  ["P6565 [NOI Online 2022] 涓归挀鎴?, "POINT_1", ["鏍?,"鏁版嵁缁撴瀯"]],
  ["P6570 [NOI Online 2022 鎻愰珮缁刔 濡備綍姝ｇ‘鍦版帓搴?, "POINT_2", ["鏁板","瀹规枼"]],
  ["P6583 鍥為杩囧幓", "POINT_1", ["鏁板","鏁拌"]],
  ["P6604 [CEOI2016] 璺敱鍣?, "POINT_1", ["鍔ㄦ€佽鍒?,"鏍戝舰DP"]],
  ["P6657 [USACO21DEC] Lonely Photo B", "POINT_1", ["鏁板","缁勫悎鏁?]],
  ["P6684 [ZJOI2020] 瀛楃涓?, "POINT_2", ["瀛楃涓?,"SAM","鍚庣紑鑷姩鏈?]],
  ["P6730 [SDOI2019] 蹇€熸煡璇?, "POINT_1", ["鏁板","绾挎€у熀"]],
  ["P6768 [USACO05MAR] Ombrophobic Bovines", "POINT_1", ["鏈€澶ф祦","浜屽垎"]],
  ["P6772 [USACO12JAN] Cow Coupons G", "POINT_1", ["璐績","鍫?]],
  ["P6783 [Ynoi2018] 鏈棩鏃跺湪鍋氫粈涔?, "POINT_2", ["鏁版嵁缁撴瀯","鍒嗗潡"]],
  ["P6835 [Cnoi2020] 绾垮舰鐢熺墿", "POINT_1", ["鍔ㄦ€佽鍒?,"鏈熸湜"]],
  ["P6864 [LOJ3470] 鐢熸垚鏍戣鏁?, "POINT_2", ["鏁板","鏁拌"]],
  ["P6883 [COCI2016-2017] 缁熻", "POINT_1", ["缁勫悎鏁板"]],
  ["P6892 [ICPC2014 WF] Baggage", "POINT_1", ["鏋勯€?]],
  ["P6902 [ICPC2014 WF] 鏀惰垂绔?, "POINT_2", ["鍥捐","鏈€鐭矾"]],
  ["P6918 [ICPC2017 WF] 姘村６", "POINT_1", ["鏈€灏忕敓鎴愭爲"]],
  ["P6931 [ICPC2017 WF] Money for Nothing", "POINT_2", ["鍒嗘不","鍔ㄦ€佽鍒?]],
  ["P6955 鏍戞渶澶у尮閰?, "POINT_1", ["鍔ㄦ€佽鍒?,"鏍戝舰DP"]],
  ["P6965 [NEERC2016] Binary Code", "POINT_2", ["瀛楃涓?,"Trie"]],
  ["P6996 鏈€澶у尯闂村拰", "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P7043 [NWRRC2015] Graph", "POINT_1", ["鍥捐","骞舵煡闆?]],
  ["P7045 [NWRRC2015] Kingdom Trip", "POINT_2", ["鍥捐","浜屽垎"]],
  ["P7077 [CSP-S2020] 璐悆铔?, "POINT_2", ["鍗氬紙璁?,"璐績"]],
  ["P7113 [NWRRC2015] Insider's Information", "POINT_1", ["鍥捐","鎷撴墤鎺掑簭"]],
  ["P7114 [NOIP2020] 瀛楃涓插尮閰?, "POINT_2", ["瀛楃涓?,"Hash"]],
  ["P7167 [eJOI2020] Fountain", "POINT_1", ["鏁版嵁缁撴瀯","鍊嶅"]],
  ["P7203 [COCI2012-2013] 鏁拌酱", "POINT_1", ["鏁板"]],
  ["P7222 [COCI2015-2016] 闈㈢Н", "POINT_1", ["鏁板","鍑犱綍"]],
  ["P7257 [COCI2011-2012] 闊充箰鍒楄〃", "POINT_1", ["鍔ㄦ€佽鍒?,"鑳屽寘"]],
  ["P7285 [USACO20DEC] Stuck in a Rut B", "POINT_1", ["妯℃嫙","鎺掑簭"]],
  ["P7294 [USACO21JAN] Cow Dance Show S", "POINT_1", ["浜屽垎","妯℃嫙"]],
  ["P7335 [USACO21FEB] Just Green Enough S", "POINT_1", ["鏍?,"鏁板"]],
  ["P7410 Just a Bit Sorted", "POINT_1", ["鏁板","缁勫悎鏁?]],
  ["P7473 [NOI Online 2021] 閲嶅姏鐞?, "POINT_1", ["妯℃嫙","BFS"]],
  ["P7485 [CSP-J2020] 鏁板瓧娓告垙", "POINT_1", ["妯℃嫙","CSP-J"]],
  ["P7486 [CSP-J2020] 鏂规牸鍙栨暟", "POINT_1", ["鍔ㄦ€佽鍒?,"CSP-J"]],
  ["P7514 [鐪侀€夎仈鑰?2021 A/B] 鍗＄墝娓告垙", "POINT_1", ["璐績","鎺掑簭"]],
  ["P7518 [鐪侀€夎仈鑰?2021] 瀹濈煶", "POINT_2", ["鏍?,"鍊嶅","鏁版嵁缁撴瀯"]],
  ["P7520 [鐪侀€夎仈鑰?2021] 鏀厤", "POINT_2", ["鍥捐","鏀厤鏍?]],
  ["P7530 [USACO21OPEN] United Cows of Farmer John", "POINT_1", ["鏍戠姸鏁扮粍"]],
  ["P7566 [JOISC 2021] 楗鍖?, "POINT_1", ["鏁版嵁缁撴瀯","绾挎鏍?]],
  ["P7585 [COCI2013-2014] 鏈哄櫒浜?, "POINT_1", ["妯℃嫙"]],
  ["P7604 [THUPC2022] 寰峰窞鎵戝厠", "POINT_1", ["妯℃嫙","瀛楃涓?]],
  ["P7610 [THUPC2021] 鏄熸槦", "POINT_1", ["璁＄畻鍑犱綍"]],
  ["P7660 [COCI2014-2015] 杞︾珯", "POINT_1", ["鍥捐","鏈€鐭矾"]],
  ["P7673 [COCI2010-2011] 鏈€闀胯矾寰?, "POINT_1", ["鍥捐","鎷撴墤鎺掑簭"]],
  ["P7712 [Ynoi2077] 绠€鍗曞瓧绗︿覆闂", "POINT_2", ["瀛楃涓?,"鍒嗗潡"]],
  ["P7740 [NOI2021] 杞婚噸杈?, "POINT_2", ["鏍?,"鏍戦摼鍓栧垎","鍔ㄦ€佽鍒?]],
  ["P7745 [NOI2021] 閲忓瓙閫氫俊", "POINT_2", ["鏁板","鏈熸湜"]],
  ["P7750 [COCI2013-2014] 璁板繂", "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P7796 [COCI2011-2012] 鎵撳瓧閿欒", "POINT_1", ["妯℃嫙","瀛楃涓?]],
  ["P7830 [COCI2018-2019] 杩峰", "POINT_1", ["BFS","鏈€鐭矾"]],
  ["P7840 [ICPC2018 WF] Catch the Plane", "POINT_2", ["鏁板","鏈熸湜","鍔ㄦ€佽鍒?]],
  ["P7868 [ACMO2021] 绁炲鐨勬暟瀛?, "POINT_1", ["鏁板","绱犳暟绛?]],
  ["P7909 [CSP-J2021] 鍒嗙硸鏋?, "POINT_1", ["鏁板","CSP-J"]],
  ["P7910 [CSP-J2021] 鍒嗙硸鏋?, "POINT_1", ["鏁板","CSP-J"]],
  ["P7911 [CSP-J2021] 鎻掑叆鎺掑簭", "POINT_1", ["鎺掑簭","妯℃嫙","CSP-J"]],
  ["P7912 [CSP-J2021] 灏忕唺鐨勬灉绡?, "POINT_1", ["妯℃嫙","鏁版嵁缁撴瀯"]],
  ["P7913 [CSP-S2021] 寤婃ˉ鍒嗛厤", "POINT_1", ["璐績","鍫?,"鎺掑簭"]],
  ["P7914 [CSP-S2021] 鎷彿搴忓垪", "POINT_1", ["鍔ㄦ€佽鍒?,"鏍?]],
  ["P7915 [CSP-S2021] 鍥炴枃", "POINT_1", ["璐績","鍙屾寚閽?]],
  ["P7916 [CSP-S2021] 浜ら€氳鍒?, "POINT_2", ["鍥捐","鏈€鐭矾"]],
  ["P7933 [COCI2011-2012] 浜ゆ浛鍜?, "POINT_1", ["鏁板","璐績"]],
  ["P7949 鍚戝乏鐪嬮綈", "POINT_1", ["鏁版嵁缁撴瀯","鍗曡皟鏍?]],
  ["P7960 [NOIP2021] 鎶ユ暟", "POINT_1", ["鏁板","绱犳暟绛?,"NOIP"]],
  ["P7961 [NOIP2021] 鏁板垪", "POINT_1", ["鍔ㄦ€佽鍒?,"鏁板","NOIP"]],
  ["P7962 [NOIP2021] 鏂瑰樊", "POINT_1", ["鏁板","璐績","NOIP"]],
  ["P7963 [NOIP2021] 妫嬪眬", "POINT_2", ["鍥捐","骞舵煡闆?,"NOIP"]],
  ["P7988 [USACO21DEC] Lonely Photo B", "POINT_1", ["鏁板","缁勫悎鏁?]],
  ["P7993 [USACO21DEC] Walking Home B", "POINT_1", ["DFS"]],
  ["P8001 [USACO20DEC] Replication G", "POINT_1", ["浜屽垎","BFS"]],
  ["P8054 灏廇涓庡皬B", "POINT_1", ["妯℃嫙","鍙屾寚閽?]],
  ["P8073 [COCI2015-2016] 鍗＄墖娓告垙", "POINT_1", ["妯℃嫙"]],
  ["P8090 [USACO22JAN] Drought B", "POINT_1", ["璐績","鏁板"]],
  ["P8092 [USACO22JAN] Cereal 2 S", "POINT_1", ["鍥捐","DFS"]],
  ["P8095 [USACO22JAN] Searching for Soulmates S", "POINT_1", ["鏁板","BFS"]],
  ["P8097 [USACO22JAN] Robot Instructions S", "POINT_1", ["浜屽垎","鎼滅储"]],
  ["P8104 [USACO22JAN] Minimizing Haybales G", "POINT_1", ["鏁板"]],
  ["P8115 [COCI2017-2018] 浜ら€氳矾绾?, "POINT_1", ["鍥捐","鏈€鐭矾"]],
  ["P8148 [JRKSJ R2] 鍚堝敱闃熷舰", "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P8176 [USACO21FEB] Count the Cows G", "POINT_1", ["鏁板","鏁拌"]],
  ["P8185 [USACO21OPEN] Portals G", "POINT_1", ["骞舵煡闆?]],
  ["P8195 [浼犳櫤鏉?#4 鍐宠禌] 灏忔櫤鐨勭枒鎯?, "POINT_1", ["妯℃嫙","瀛楃涓?]],
  ["P8200 [浼犳櫤鏉?#4 鍐宠禌] 绱犳暟", "POINT_1", ["鏁板","绱犳暟绛?]],
  ["P8242 涓夊厓缁?, "POINT_1", ["鏁板","缁勫悎鏁?]],
  ["P8250 [NOI Online 2022 鍏ラ棬缁刔 鏁板娓告垙", "POINT_1", ["鏁板"]],
  ["P8251 [NOI Online 2022 鍏ラ棬缁刔 鐜嬪浗姣旇禌", "POINT_1", ["妯℃嫙"]],
  ["P8252 [NOI Online 2022 鎻愰珮缁刔 璁ㄨ", "POINT_1", ["鍥捐","浜屽垎鍥?]],
  ["P8253 [NOI Online 2022 鎻愰珮缁刔 濡備綍姝ｇ‘鍦版帓搴?, "POINT_2", ["鏁板","瀹规枼"]],
  ["P8254 [NOI Online 2022 鎻愰珮缁刔 涓归挀鎴?, "POINT_1", ["鏍?,"鏁版嵁缁撴瀯"]],
  ["P8290 [鐪侀€夎仈鑰?2022] 濉爲", "POINT_2", ["鍔ㄦ€佽鍒?,"瀹规枼"]],
  ["P8292 [鐪侀€夎仈鑰?2022] 鍗＄墝", "POINT_1", ["鏁板","缁勫悎鏁?]],
  ["P8293 [鐪侀€夎仈鑰?2022] 搴忓垪鍙樻崲", "POINT_2", ["鏁版嵁缁撴瀯","绾挎鏍?]],
  ["P8294 [鐪侀€夎仈鑰?2022] 鏈€澶ф潈鐙珛闆嗛棶棰?, "POINT_2", ["鍔ㄦ€佽鍒?,"鏍?]],
  ["P8310 [COCI2021-2022] 浜ゆ崲娓告垙", "POINT_1", ["妯℃嫙"]],
  ["P8330 [ZJOI2022] 浼楁暟", "POINT_2", ["鏁版嵁缁撴瀯","鍒嗗潡","ZJOI"]],
  ["P8350 [SDOI/SXOI2022] 杩涘埗杞崲", "POINT_1", ["鏁板","鏁颁綅DP"]],
  ["P8371 [COCI2019-2020] 閬撹矾", "POINT_1", ["鍥捐","骞舵煡闆?]],
  ["P8385 [COCI2021-2022] 鎷彿搴忓垪", "POINT_1", ["鏍?,"妯℃嫙"]],
  ["P8400 [CCC2022] 鏁板瓧涓夎褰?, "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P8410 搴忓垪鐢熸垚", "POINT_1", ["鏁板","妯℃嫙"]],
  ["P8422 鍗冨矝涔嬪浗", "POINT_1", ["杩為€氬潡","BFS"]],
  ["P8444 涓€鍏冧笁娆℃柟绋?, "POINT_1", ["鏁板","浜屽垎"]],
  ["P8452 [COCI2017-2018] 浼犳挱", "POINT_1", ["妯℃嫙"]],
  ["P8470 [AyaRound 1 D] 涓嶅綊涔嬩汉", "POINT_2", ["鏍?,"鏍戦摼鍓栧垎"]],
  ["P8503 [NOI2022] 绉婚櫎鐭冲瓙", "POINT_2", ["鍗氬紙璁?,"鏁板"]],
  ["P8538 [CSP-J2022] 灏忚嫻鏋?, "POINT_1", ["鏁板","妯℃嫙","CSP-J"]],
  ["P8540 [CSP-J2022] 涓婂崌鐐瑰垪", "POINT_1", ["鍔ㄦ€佽鍒?,"CSP-J"]],
  ["P8541 [CSP-J2022] 缃戠粶杩炴帴", "POINT_1", ["妯℃嫙","瀛楃涓?,"CSP-J"]],
  ["P8568 [JRKSJ R6] 杩為攣鍙嶅簲", "POINT_1", ["鍥捐","鎷撴墤鎺掑簭"]],
  ["P8588 [COCI2022-2023] 璺濈", "POINT_1", ["鏁板","鎺掑簭"]],
  ["P8619 [钃濇ˉ鏉?2022 鍥?C] 璐ㄥ洜鏁颁釜鏁?, "POINT_1", ["鏁板","绾︽暟"]],
  ["P8620 [钃濇ˉ鏉?2022 鍥?C] 鍙栨ā", "POINT_1", ["鏁板"]],
  ["P8621 [钃濇ˉ鏉?2022 鍥?C] 鍖洪棿姹傚拰", "POINT_1", ["鍓嶇紑鍜?]],
  ["P8635 [钃濇ˉ鏉?2023 鐪?A] 鏁扮殑绉嶇被", "POINT_1", ["鏁板","鏋氫妇"]],
  ["P8646 [钃濇ˉ鏉?2023 鐪?C] 鏁存暟鍒犻櫎", "POINT_1", ["鏁版嵁缁撴瀯","鍫?]],
  ["P8661 [钃濇ˉ鏉?2023 鐪?C] 鏋氫妇", "POINT_1", ["妯℃嫙"]],
  ["P8680 [钃濇ˉ鏉?2022 鐪?C] 姹傚拰", "POINT_1", ["鍓嶇紑鍜?,"鏁板"]],
  ["P8703 [钃濇ˉ鏉?2023 鍥?A] 鐜舰瀛楃涓?, "POINT_2", ["瀛楃涓?,"KMP"]],
  ["P8715 [钃濇ˉ鏉?2020 鐪?AB3] 瀛愪覆鍒嗗€?, "POINT_1", ["瀛楃涓?,"鏁板"]],
  ["P8720 [钃濇ˉ鏉?2022 鐪?A] 鏁扮殑鎷嗗垎", "POINT_1", ["鏁板","鏁拌"]],
  ["P8744 [钃濇ˉ鏉?2022 鐪?C] 鍖洪棿鏈€澶у拰", "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P8753 [钃濇ˉ鏉?2021 鐪?AB2] 涔樼Н鏈€澶?, "POINT_1", ["鏁板","璐績"]],
  ["P8766 [钃濇ˉ鏉?2021 鍥?B] 鏈€灏戠牆鐮?, "POINT_1", ["鏁板","璐績"]],
  ["P8780 [钃濇ˉ鏉?2022 鐪?B] 淇壀鐏屾湪", "POINT_1", ["鏁板","妯℃嫙"]],
  ["P8783 [钃濇ˉ鏉?2022 鐪?A] 缁熻瀛愮煩闃?, "POINT_1", ["鍓嶇紑鍜?,"浜屽垎"]],
  ["P8792 [钃濇ˉ鏉?2022 鍥?C] 鏂愭尝閭ｅ", "POINT_1", ["鏁板","鐭╅樀蹇€熷箓"]],
  ["P8805 [钃濇ˉ鏉?2022 鍥?B] 鍗＄墝", "POINT_1", ["璐績","浜屽垎"]],
  ["P8813 [CSP-J2022] 涔樻柟", "POINT_1", ["鏁板","CSP-J"]],
  ["P8814 [CSP-J2022] 瑙ｅ瘑", "POINT_1", ["鏁板","浜屽垎","CSP-J"]],
  ["P8815 [CSP-J2022] 閫昏緫琛ㄨ揪寮?, "POINT_1", ["瀛楃涓?,"DFS","CSP-J"]],
  ["P8816 [CSP-J2022] 涓婂崌鐐瑰垪", "POINT_1", ["鍔ㄦ€佽鍒?,"CSP-J"]],
  ["P8858 鎶樼嚎", "POINT_1", ["璁＄畻鍑犱綍"]],
  ["P8865 [NOIP2022] 绉嶈姳", "POINT_1", ["鏁板","缁勫悎鏁?,"NOIP"]],
  ["P8866 [NOIP2022] 鍠典簡涓柕", "POINT_1", ["鏋勯€?,"妯℃嫙","NOIP"]],
  ["P8867 [NOIP2022] 寤洪€犲啗钀?, "POINT_1", ["鍥捐","鏍?]],
  ["P8868 [NOIP2022] 姣旇禌", "POINT_2", ["鏁版嵁缁撴瀯","绾挎鏍?,"NOIP"]],
  ["P8872 [浼犳櫤鏉?#5 鍒濊禌] 鑾插瓙鐨勭墿鐞嗙儹鍔涘", "POINT_1", ["鏁板","妯℃嫙"]],
  ["P8882 [浼犳櫤鏉?#5 鍒濊禌] 鏁板垪璁＄畻", "POINT_1", ["鏁板"]],
  ["P8921 [COCI2022-2023] 缁熻", "POINT_1", ["鍓嶇紑鍜?]],
  ["P8941 [Cnoi2023] 瀛楃涓?, "POINT_1", ["瀛楃涓?]],
  ["P8952 [CCC2023] 榄旀硶缂栫爜", "POINT_1", ["鏁板"]],
  ["P8960 [Cnoi2022] 鎼滅储", "POINT_1", ["DFS","浜屽垎"]],
  ["P8973 [CF Round #895] 绛夋瘮鏁板垪", "POINT_1", ["鏁板"]],
  ["P9012 [钃濇ˉ鏉?2023 鐪?A] 鏂板勾璐哄崱", "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P9022 [COCI2021-2022] 鐏场", "POINT_1", ["妯℃嫙","鏁扮粍"]],
  ["P9048 [PA2022] 鏈哄櫒浜?, "POINT_1", ["妯℃嫙"]],
  ["P9084 [PA2022] 鍖洪棿", "POINT_1", ["鍓嶇紑鍜?]],
  ["P9110 [鏄ュ娴嬭瘯 2023] 瀵嗙爜閿?, "POINT_1", ["鏁板","璐績"]],
  ["P9118 [鏄ュ娴嬭瘯 2023] 鍦ｈ癁鏍?, "POINT_2", ["鍔ㄦ€佽鍒?,"鍑犱綍"]],
  ["P9143 [THUPC 2023 鍒濊禌] 姣旂壒甯?, "POINT_1", ["鏁板","妯℃嫙"]],
  ["P9174 [COCI2023-2024] 鏁板瓧娓告垙", "POINT_1", ["鏁板"]],
  ["P9190 [USACO23OPEN] Milk Sum S", "POINT_1", ["鏁板","鍓嶇紑鍜?]],
  ["P9200 [钃濇ˉ鏉?2023 鐪?A] 妫嬬洏", "POINT_1", ["宸垎","鍓嶇紑鍜?]],
  ["P9240 [钃濇ˉ鏉?2023 鐪?B] 椋炴満闄嶈惤", "POINT_1", ["璐績","鎺掑簭"]],
  ["P9274 [THUPC 2024 鍒濊禌] 浜岃繘鍒剁煩闃?, "POINT_1", ["鏁板","浣嶈繍绠?]],
  ["P9300 [钃濇ˉ鏉?2024 鐪?A] 椋炴満澶ф垬", "POINT_1", ["妯℃嫙"]],
  ["P9319 [COCI2023-2024] 杩峰", "POINT_1", ["BFS"]],
  ["P9360 [ICPC2023 WF] 鎺掑簭缃戠粶", "POINT_2", ["鏁版嵁缁撴瀯","绾挎鏍?]],
  ["P9390 [USACO23DEC] Cowntact Tracing 2 B", "POINT_1", ["妯℃嫙"]],
  ["P9408 [钃濇ˉ鏉?2024 鐪?C] 瀛愬簭鍒?, "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P9440 [ICPC2023 Asia] 鐭╅樀涔樻硶", "POINT_1", ["鏁板"]],
  ["P9475 [COCI2023-2024] 搴忓垪", "POINT_1", ["鍓嶇紑鍜?]],
  ["P9500 [CSP-J2023] 灏忚嫻鏋?, "POINT_1", ["鏁板","妯℃嫙","CSP-J"]],
  ["P9501 [CSP-J2023] 鍏矾缁翠慨", "POINT_1", ["璐績","CSP-J"]],
  ["P9510 [NOIP2023] 璇嶅吀", "POINT_1", ["瀛楃涓?,"鎺掑簭","NOIP"]],
  ["P9511 [NOIP2023] 涓夊€奸€昏緫", "POINT_1", ["鍥捐","DFS","NOIP"]],
  ["P9520 [NOIP2023] 澶╁ぉ鐖辨墦鍗?, "POINT_1", ["鍔ㄦ€佽鍒?,"绾挎鏍?,"NOIP"]],
  ["P9530 [NOIP2023] 鍗氬紙鏍?, "POINT_2", ["鍗氬紙璁?,"鏍?,"NOIP"]],
  ["P9560 [鐪侀€夎仈鑰?2024] 瀛ｉ", "POINT_1", ["鏁板"]],
  ["P9600 [钃濇ˉ鏉?2024 鍥?C] 瀹屽叏骞虫柟鏁?, "POINT_1", ["鏁板","鏁拌"]],
  ["P9640 [CSP-J2024] 閫昏緫鍒ゆ柇", "POINT_1", ["妯℃嫙","CSP-J"]],
  ["P9650 [NOIP2024] 缂栬緫璺濈", "POINT_2", ["鍔ㄦ€佽鍒?,"瀛楃涓?,"NOIP"]],
  ["P9700 [钃濇ˉ鏉?2025 鐪?B] 杩為€氬潡璁℃暟", "POINT_1", ["骞舵煡闆?]],
  ["P9723 [CCC2024] 榄旀硶鍙ｈ", "POINT_1", ["鍔ㄦ€佽鍒?]],
  ["P9748 [CSP-J2023] 涓€鍏冧簩娆℃柟绋?, "POINT_1", ["鏁板","妯℃嫙","CSP-J"]],
  ["P9750 [CSP-J2023] 涓€鍏冧簩娆℃柟绋?, "POINT_1", ["鏁板","妯℃嫙","CSP-J"]],
  ["P9780 [CCC2024] 搴忓垪鍙樻崲", "POINT_1", ["鏁板"]],
  ["P9800 [鏄ュ娴嬭瘯 2024] 宸￠€?, "POINT_2", ["鏍?,"璐績"]],
];

async function main() {
  // ====== 绗竴姝ワ細涓哄凡鏈夌殑512棰樿ˉ鍏呴闈?======
  console.log("=== 琛ュ厖棰橀潰 ===");
  const problems = await p.problem.findMany({ include: { versions: { where: { isCurrent: true }, take: 1 }, tags: true, sourceInfo: true } });
  let enriched = 0;
  for (const prob of problems) {
    const ver = prob.versions[0];
    if (!ver) continue;
    const desc = ver.description || '';
    // 濡傛灉鎻忚堪澶煭鎴栧凡缁忔槸榛樿鐨勭畝鍖栫増鏈紝鍒欐洿鏂?
    if (desc.length < 80 || desc.includes('璇峰弬鑰冨師棰橀摼鎺?) || desc.includes('璇峰弬鑰冨師棰?)) {
      const tagNames = prob.tags?.map((t: any) => t.name) || [];
      const newDesc = generateDescription(prob.title, prob.difficulty || 'POINT_1', tagNames, prob.source);
      await p.problemVersion.update({ where: { id: ver.id }, data: { description: newDesc } });
      enriched++;
      if (enriched % 100 === 0) console.log(`  宸茶ˉ鍏?${enriched} 閬撻闈?..`);
    }
  }
  console.log(`棰橀潰琛ュ厖瀹屾垚: ${enriched} 閬揬n`);

  // ====== 绗簩姝ワ細鎵归噺瀵煎叆鏂伴鐩?======
  console.log("=== 鎵归噺瀵煎叆鏂伴鐩?===");
  if (NEW_PROBLEMS.length > 0) {
    const existingTitles = new Set(problems.map(p => p.title));
    let newCreated = 0, newSkipped = 0;
    for (const [title, difficulty, tags] of NEW_PROBLEMS) {
      if (existingTitles.has(title)) { newSkipped++; continue; }
      const source = 'EXTERNAL';
      const pid = title.match(/P\d+/)?.[0];
      const url = pid ? `https://www.luogu.com.cn/problem/${pid}` : null;
      const desc = generateDescription(title, difficulty, tags, source);

      const prob = await p.problem.create({
        data: {
          title, source, difficulty: difficulty as string,
          timeLimit: 1000, memoryLimit: difficulty === 'POINT_2' ? 256 : 125,
          status: 'PUBLISHED',
          versions: { create: { version: 1, description: desc } },
          tags: { create: tags.map(n => ({ name: n, type: 'TAG' })) },
          sourceInfo: url ? { create: { platform: 'LUOGU', remoteProblemId: pid || '', remoteUrl: url } } : undefined,
        },
      });
      newCreated++;
      if (newCreated % 50 === 0) console.log(`  宸插垱寤?${newCreated} 棰?..`);
    }
    console.log(`鏂板: ${newCreated}, 璺宠繃: ${newSkipped}`);
  }

  const total = await p.problem.count();
  const localCount = await p.problem.count({ where: { source: 'LOCAL' } });
  const externalCount = await p.problem.count({ where: { source: 'EXTERNAL' } });
  console.log(`\n鉁?鎬昏: ${total} 棰?(鍘熷垱 ${localCount} + 娲涜胺 ${externalCount})`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

