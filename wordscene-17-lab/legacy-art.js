/* Reused 16.17 illustration rendering, isolated from its progress/state. */
(function(){
const words=window.WS17_SEED.slice();
const svgPath=(d,fill='none',stroke='#463252',width=3)=>`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const ellipse=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const circle=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const rect=(x,y,w,h,fill,rx=8)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const label=(x,y,t)=>`<text x="${x}" y="${y}" text-anchor="middle" fill="#5b467c" font-family="system-ui,sans-serif" font-size="13" font-weight="600">${t}</text>`;
const group=(x,y,body,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;
const star=(x,y)=>group(x,y,svgPath('M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z','#d3a44d','none'));
const splash=(x,y)=>group(x,y,svgPath('M-35 0 L-48 -18 M-12 -5 L-18 -31 M13 -4 L23 -29 M35 0 L51 -14','none','#76afb0',5));
const whale=()=>svgPath('M8 30 C6 6 45 -1 64 18 Q79 32 91 19 L88 6 Q103 9 107 24 Q112 6 126 8 L118 32 Q107 44 94 39 C71 74 13 66 8 30Z','#79b9bc')+circle(30,27,3,'#463252')+svgPath('M25 40 Q36 47 44 39')+svgPath('M57 51 L75 58 L65 41','#b0d6ce');
const person=()=>circle(0,-46,13,'#e8b78f')+svgPath('M0 -29 L0 12 M0 -18 L-25 -3 M0 -18 L25 -10 M0 12 L-17 42 M0 12 L20 40','none','#67508f',10);
const bucket=()=>svgPath('M-35 0 L-25 70 Q0 80 25 70 L35 0Z','#e9bd66')+svgPath('M-30 5 C-55 -58 55 -58 30 5','none','#67508f',4)+ellipse(0,0,35,9,'#f7d793');
const artBodies={
mug:()=>group(45,60,svgPath('M0 135 L15 55 L55 55 L76 135Z','#a18bc3')+circle(34,47,22,'#e8bb96')+svgPath('M12 36 L34 -22 L60 36Z','#57437c')+svgPath('M16 59 Q32 101 54 59 L36 66Z','#fffdf3','none')+svgPath('M55 75 L100 56','none','#57437c',12)+svgPath('M95 55 L135 18','none','#bf8c42',5)+circle(28,46,2,'#463252')+circle(41,46,2,'#463252'))+group(228,115,svgPath('M-47 0 L-42 73 Q0 95 42 73 L47 0Z','#f9f4dd')+svgPath('M46 12 C97 5 97 66 45 61','none','#f9f4dd',14)+svgPath('M46 12 C97 5 97 66 45 61')+ellipse(0,0,47,12,'#bdd5c2')+svgPath('M-15 -3 Q-57 -63 -36 -83 M0 -4 Q-2 -75 20 -84 M17 -5 Q60 -61 67 -43','none','#88aaa1',4))+star(181,49)+star(250,45)+star(302,83)+label(80,235,'маг колдует')+label(245,235,'огромную кружку'),
fist:()=>group(132,24,svgPath('M-40 48 L-40 20 Q-39 5 -27 9 L-20 13 L-20 4 Q-13 -9 -3 2 L4 10 Q12 -6 22 4 L28 17 Q40 6 48 19 L49 44 L65 48 Q80 58 67 70 L42 81 L36 101 L-26 101 L-28 82 Q-51 67 -40 48Z','#e4b28c')+svgPath('M-20 16 L-17 38 M4 12 L8 37 M28 19 L30 39 M-22 55 L26 55'))+group(182,170,svgPath('M-54 0 Q-50 -48 -3 -43 L-10 -9 L-32 22Z','#e9d3a1')+svgPath('M9 -39 Q57 -39 56 5 L33 29 L16 8Z','#e9d3a1')+ellipse(0,5,22,32,'#9dbb6b'))+svgPath('M116 142 L102 128 M229 143 L244 123 M123 188 L102 197 M238 184 L257 192','none','#d1a144',4)+star(174,130)+label(180,235,'кулак раскалывает фисташку'),
moss:()=>svgPath('M20 208 Q170 170 340 208','none','#a8d0ce',18)+svgPath('M25 169 Q180 63 335 169 L335 193 Q180 102 25 193Z','#c0aa84')+svgPath('M26 153 Q180 45 335 153','none','#47695b',7)+[40,80,120,160,200,240,280,320].map(x=>svgPath(`M${x} ${151-Math.sin((x-25)/310*Math.PI)*75} l0 37`,'none','#47695b',4)).join('')+svgPath('M30 173 Q180 73 330 173','none','#83a963',22)+[45,75,104,133,162,191,220,249,278,307].map((x,i)=>circle(x,165-Math.sin((x-30)/300*Math.PI)*68,10+i%3,'#9dbb6d')).join('')+group(202,77,svgPath('M0 -25 L0 16 L20 19 M-1 -25 L-20 12 L-6 19','none','#57437c',8))+label(180,239,'мост утопает в мягком мхе'),
net:()=>group(178,151,person())+svgPath('M72 59 Q180 19 288 59 L319 205 Q180 239 41 205Z','#dce4cb99','#668e7c',3)+[85,120,155,190,225,260].map(x=>svgPath(`M${x} 58 L${x-26} 214`,'none','#668e7c',2)).join('')+[80,110,140,170,200].map(y=>svgPath(`M${68-(y-80)*.2} ${y} Q180 ${y+18} ${293+(y-80)*.2} ${y}`,'none','#668e7c',2)).join('')+rect(232,13,95,45,'#fffdf4',18)+svgPath('M246 54 L226 72 L258 57','#fffdf4','none')+label(280,41,'НЕТ!')+label(180,253,'попал в сеть — кричишь «нет!»'),
fence:()=>group(28,100,svgPath('M0 0 Q-8 -20 15 -25 L65 -15 L65 20 L18 27 Q0 25 0 0Z','#ddb26a')+svgPath('M15 25 L19 66 L39 66 L34 24Z','#67508f')+svgPath('M65 -15 L77 -15 L77 20 L65 20Z','#67508f')+svgPath('M22 65 Q45 100 4 107'))+svgPath('M120 83 Q175 68 208 93 M120 112 Q177 95 217 123 M120 143 Q166 131 211 150','none','#78aaa8',4)+[218,253,288].map(x=>svgPath(`M${x} 210 Q${x+13} 140 ${x+42} 78 L${x+58} 70 L${x+61} 89 Q${x+29} 153 ${x+23} 210Z`,'#bf9770')).join('')+svgPath('M213 168 L332 168 M228 124 L341 124','none','#ac835f',9)+label(180,245,'фен гнёт доски забора'),
bucket:()=>rect(18,108,76,99,'#9db29b')+ellipse(56,108,38,10,'#537a6b')+ellipse(56,207,38,10,'#9db29b')+svgPath('M20 138 L90 138 M20 175 L90 175','none','#6d8f7c',3)+group(105,38,whale(),.95)+svgPath('M73 85 Q143 -1 250 84','none','#ca9d4d',3)+svgPath('M237 77 L251 85 L250 69','none','#ca9d4d',3)+group(280,143,bucket())+splash(280,131)+label(54,245,'бак')+label(171,125,'кит прыгает')+label(282,245,'в ведро'),
rope:()=>svgPath('M27 178 C74 69 130 216 175 112 S245 168 326 66','none','#57437c',17)+svgPath('M27 178 C74 69 130 216 175 112 S245 168 326 66','none','#d6b773',11)+ellipse(179,124,25,27,'#d6b773')+ellipse(179,134,13,8,'#57437c')+svgPath('M164 113 L174 117 M186 117 L195 112','none','#57437c',3)+rect(207,155,125,42,'#fffdf4',18)+label(270,181,'р-р-ропот…')+svgPath('M211 160 L202 144 L229 158','#fffdf4','none')+label(180,242,'верёвка недовольно ропщет'),
shovel:()=>ellipse(183,218,107,13,'#d8dfcb')+group(178,25,svgPath('M-18 0 L18 0 L18 21 Q0 40 -18 21Z','#c9aa74')+svgPath('M0 31 L0 122','none','#b08c61',10)+svgPath('M-34 119 L34 119 L28 162 L0 183 L-28 162Z','#96b5ae')+svgPath('M0 127 L0 167','none','#53796e',3))+svgPath('M118 78 Q96 99 118 122 M242 106 Q261 129 243 147','none','#bf9a54',3)+[ [126,199],[249,205],[108,175],[259,182]].map(([x,y])=>ellipse(x,y,6,4,'#ae9165')).join('')+label(180,250,'лопата сама шевелится'),
puddle:()=>ellipse(185,208,135,30,'#a5cbd0')+ellipse(185,207,87,13,'#c4dedb')+group(185,126,`<g transform="rotate(-32)">${person()}</g>`)+splash(182,183)+svgPath('M114 57 Q100 94 121 119 M264 85 L244 136','none','#ca9d4d',3)+svgPath('M236 124 L244 137 L255 129','none','#ca9d4d',3)+label(180,254,'падал — прямо в лужу'),
blanket:()=>rect(25,28,93,115,'#fffdf4')+label(72,50,'БЛАНК')+svgPath('M39 69 L103 69 M39 85 L93 85 M39 101 L104 101 M39 117 L80 117','none','#a4b79c',3)+svgPath('M136 75 Q177 62 199 90 M187 79 L201 91 L185 95','none','#ca9d4d',3)+group(172,110,whale(),1.22)+svgPath('M214 125 Q272 105 320 142 L335 204 Q277 220 213 197Z','#d8b56e')+svgPath('M229 135 L236 203 M254 128 L268 208 M280 132 L299 207 M218 155 L325 162 M219 178 L331 188','none','#f6e3b1',3)+label(69,166,'бланк')+label(265,245,'укрывает кита как одеяло')
};
const ink='#57437c',cream='#f7df9f',orange='#dc9e64';
const eyes=(x,y)=>circle(x-12,y,3,ink)+circle(x+12,y,3,ink);
const catFace=()=>svgPath('M-45 25 L-45 -40 L-19 -20 Q0 -30 19 -20 L45 -40 L45 25 Q0 64 -45 25Z',cream)+eyes(0,2)+svgPath('M-8 15 L8 15 L0 23Z',orange)+svgPath('M-15 24 L-65 17 M-15 32 L-65 36 M15 24 L65 17 M15 32 L65 36');
const house=()=>rect(-55,0,110,85,cream)+svgPath('M-70 0 L0 -55 L70 0Z',orange)+rect(-15,35,30,50,ink);
const tree=()=>rect(-12,0,24,100,'#b79069')+circle(0,-30,65,'#a3bf79');
const bookShape=()=>svgPath('M0 0 Q-40 -24 -80 -8 L-80 88 Q-35 72 0 99 Q35 72 80 88 L80 -8 Q40 -24 0 0Z','#fffdf4')+svgPath('M0 0 L0 99 M-65 15 L-15 25 M-65 35 L-15 45 M15 25 L65 15 M15 45 L65 35');
const fishShape=()=>ellipse(0,0,63,35,'#85bdbe')+svgPath('M53 0 L92 -35 L92 35Z','#85bdbe')+circle(-37,-6,4,ink);
const bearFace=()=>circle(-38,-35,23,orange)+circle(38,-35,23,orange)+circle(0,0,53,orange)+ellipse(0,23,25,20,cream)+eyes(0,0)+ellipse(0,14,9,6,ink);
const hatShape=()=>ellipse(0,15,93,21,ink)+rect(-43,-42,86,62,ink)+rect(-43,-2,86,13,cream,0);
const ballShape=()=>circle(0,0,52,cream)+svgPath('M-48 -15 Q0 15 48 -15 M-12 -50 Q18 0 -12 50');
const sockShape=()=>svgPath('M-22 -65 L27 -65 L27 8 Q75 30 47 59 Q12 86 -29 42 L-35 29Z',cream)+svgPath('M-23 -48 L26 -48');
Object.assign(artBodies,{
cat:()=>group(140,125,catFace())+rect(260,40,44,85,'#c95e47')+rect(266,28,32,18,cream)+svgPath('M270 110 Q240 70 172 147 M174 151 L206 158 M172 146 L209 141','none','#c95e47',7)+label(180,242,'кетчуп рисует коту усы'),
dog:()=>ellipse(130,134,88,53,orange)+group(213,88,circle(0,0,40,orange)+ellipse(-32,5,15,37,ink)+ellipse(23,12,32,20,cream)+circle(10,-6,4,ink))+svgPath('M70 164 L65 215 M170 164 L180 215 M45 127 L20 77','none',orange,17)+group(304,170,house(),.5)+label(180,246,'дог не помещается в будке'),
tree:()=>group(180,110,tree())+label(143,83,'3')+label(180,55,'3')+label(217,83,'3')+label(180,246,'три цифры выросли на дереве'),
book:()=>group(180,100,tree())+group(180,112,bookShape(),.85)+label(180,246,'бук раскрывается как книга'),
pen:()=>rect(95,151,170,61,orange)+ellipse(180,151,85,27,cream)+ellipse(180,151,50,15,ink)+ellipse(180,151,44,11,cream)+svgPath('M180 143 L215 37 L231 43 L195 149 L180 161Z','#85bdbe')+label(180,246,'ручка рисует на пне'),
fish:()=>group(142,100,fishShape())+[[120,92],[147,114],[172,89],[210,170],[240,205],[110,195]].map(([x,y],i)=>circle(x,y,12,['#ce8064',cream,'#97b36e'][i%3])).join('')+svgPath('M30 220 L325 220')+label(180,250,'рыба рассыпает фишки'),
frog:()=>group(180,75,circle(-25,0,19,'#9dbb6b')+circle(25,0,19,'#9dbb6b')+ellipse(0,25,50,32,'#9dbb6b')+eyes(0,2)+svgPath('M-28 28 Q0 45 28 28')+svgPath('M-30 55 L30 55 L52 150 L12 129 L0 90 L-12 129 L-52 150Z',ink)+svgPath('M-17 60 L0 83 L17 60Z','#fffdf4'))+splash(180,214)+label(180,251,'лягушка прыгает во фраке'),
sheep:()=>ellipse(177,135,86,54,'#fffdf4')+ellipse(267,132,29,36,orange)+[100,135,170,205].map(x=>svgPath(`M${x} 109 L${x+12} 61 L${x+25} 104Z`,cream)).join('')+svgPath('M128 177 L128 213 M215 177 L215 213','none',ink,9)+circle(270,123,4,ink)+circle(184,53,20,'#85bdbe')+svgPath('M170 46 L195 60 M171 57 L193 44')+label(180,247,'у овцы выросли шипы'),
bed:()=>rect(63,100,230,68,cream)+rect(74,86,64,29,'#fffdf4')+svgPath('M72 165 L52 199 L77 212 M276 165 L303 191 L322 180','none',ink,9)+svgPath('M26 111 L51 111 M12 133 L47 133','none',orange,4)+label(180,247,'беда: кровать убежала'),
hat:()=>group(180,131,house())+group(180,83,hatShape(),1.3)+label(180,247,'шляпа накрыла хату'),
cup:()=>circle(137,51,27,'#b5d5d0')+circle(180,38,36,'#b5d5d0')+circle(222,53,26,'#b5d5d0')+svgPath('M175 86 Q152 121 178 127 Q202 120 175 86Z',orange)+group(180,147,svgPath('M-48 0 L-39 55 Q0 75 39 55 L48 0Z','#fffdf4')+svgPath('M48 8 C90 5 90 54 43 46')+ellipse(0,0,48,10,orange))+label(180,247,'чай капает в чашку'),
bear:()=>group(180,142,bearFace())+ellipse(173,83,73,28,ink)+svgPath('M175 56 L180 44','none',ink,8)+rect(128,91,102,23,ink)+label(180,247,'берет закрыл медведю глаза'),
ball:()=>group(180,147,ballShape())+svgPath('M159 100 L180 110 L201 100 L201 123 L180 112 L159 123Z',ink)+svgPath('M100 163 Q77 123 107 96 M252 121 Q278 160 251 187','none',orange,3)+group(180,30,star(0,0)+svgPath('M-55 10 Q0 50 55 10','none',orange,4))+label(180,247,'мяч танцует на балу'),
doll:()=>svgPath('M12 218 L90 65 L150 218Z','#a3bf79')+svgPath('M208 218 L284 58 L350 218Z','#a3bf79')+group(180,147,person(),1.2)+svgPath('M159 90 Q108 65 90 65 M201 90 Q247 58 284 58','none',orange,11)+svgPath('M161 121 L200 121 L218 170 L144 170Z','#cd8f81')+label(180,247,'кукла сидит в долине'),
cake:()=>rect(86,154,190,63,orange)+ellipse(181,154,95,23,'#fffdf4')+group(181,62,svgPath('M-25 0 L-18 42 L18 42 L25 0Z',cream)+circle(-15,-5,18,'#fffdf4')+circle(13,-5,18,'#fffdf4'))+splash(180,144)+label(180,247,'кекс прыгает на торте'),
nose:()=>svgPath('M162 58 Q160 103 118 157 Q112 182 160 182 Q192 199 219 175','none',orange,15)+group(190,108,ellipse(0,0,42,20,'#9aafa1')+ellipse(-37,-6,22,17,'#9aafa1')+svgPath('M-54 -12 L-65 -34 L-41 -16Z',cream)+circle(-43,-9,3,ink)+svgPath('M-15 13 L-15 29 M22 13 L22 29','none',ink,7),.8)+splash(105,173)+label(180,247,'носорог щекочет нос'),
sock:()=>group(231,148,sockShape())+rect(55,40,65,95,orange)+label(87,90,'СОК')+svgPath('M118 59 Q175 35 230 96','none',orange,11)+splash(232,93)+label(180,247,'сок наполняет носок'),
duck:()=>ellipse(123,151,58,46,cream)+circle(117,86,36,cream)+svgPath('M143 83 L179 96 L145 105Z',orange)+circle(125,79,4,ink)+rect(89,38,54,25,'#fffdf4')+svgPath('M116 41 L116 59 M108 50 L124 50','none','#cd7b66',4)+ellipse(279,146,46,61,'#fffdf4')+svgPath('M105 118 Q125 230 229 163','none',ink,4)+circle(233,160,12,ink)+label(180,247,'утка-доктор слушает яйцо'),
lamp:()=>svgPath('M165 90 L165 207 M124 207 L210 207','none',ink,9)+svgPath('M122 32 L210 32 L240 94 L94 94Z',cream)+[ [136,138],[194,153],[241,201]].map(([x,y])=>group(x,y,svgPath('M-12 -10 L12 -10 L20 7 L-20 7Z',cream)+svgPath('M0 7 L0 23 M-12 23 L12 23'),.9)).join('')+label(180,247,'из лампы сыплются лампы'),
star:()=>group(177,121,svgPath('M0 -76 L22 -23 L79 -22 L34 13 L47 72 L0 40 L-47 72 L-34 13 L-79 -22 L-22 -23Z',cream)+circle(-17,-4,13,'#fffdf4')+circle(17,-4,13,'#fffdf4')+svgPath('M-4 -4 L4 -4 M-42 25 L-73 39 M40 25 L70 39 M70 36 L70 101','none',ink,4)+eyes(0,-4))+label(180,247,'старая звезда идёт с палочкой')
});

function illustration(key){const entry=words.find(w=>w.en===key);if(entry?.props)return WordSceneContent.render(entry);if(key==='mug')return `<img class="scene-photo" src="../wordscene/assets/mug-scene.png" width="1448" height="1086" alt="Маг вызывает золотой фонтан из огромной кружки">`;return `<svg class="scene-svg" viewBox="0 0 360 270" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${words.find(w=>w.en===key)?.scene||key}"><rect width="360" height="270" rx="20" fill="#f0eaf9"/>${artBodies[key]()}</svg>`}
let sceneHidden=false;


words.push(
{en:'ant',ru:'муравей',ipa:'/ænt/',cue:'антенна',scene:'Муравей тащит антенну выше дерева. Его усики ловят сигнал, а антенна щекочет облака.'},
{en:'apple',ru:'яблоко',ipa:'/ˈæpəl/',cue:'аппликация',scene:'Яблоко делает аппликацию из собственной кожуры: приклеивает яблочные кусочки к огромному листу.'},
{en:'bird',ru:'птица',ipa:'/bɜːd/',cue:'бирка',scene:'Птица летит с огромной биркой на лапке. Бирка тяжёлая: птица машет крыльями и тянет её по небу.'},
{en:'box',ru:'коробка',ipa:'/bɒks/',cue:'бокс',scene:'Коробка надела боксёрские перчатки. Она боксирует, а из-под крышки вылетают конфетти.'},
{en:'chair',ru:'стул',ipa:'/tʃeə/',cue:'черпак',scene:'Гигантский черпак зачерпнул стул, словно суп. Ножки стула торчат из черпака во все стороны.'},
{en:'cheese',ru:'сыр',ipa:'/tʃiːz/',cue:'чизкейк',scene:'Кусок сыра подпрыгивает на огромном чизкейке. Дырочки сыра наполняются сладким кремом.'},
{en:'coat',ru:'пальто',ipa:'/kəʊt/',cue:'кот',scene:'Кот надел пальто с сотней карманов. Из каждого кармана высунулся кошачий хвост.'},
{en:'door',ru:'дверь',ipa:'/dɔː/',cue:'дорога',scene:'Дверь лежит поперёк дороги. Машины подъезжают и звонят в дверной звонок, чтобы проехать дальше.'},
{en:'horse',ru:'лошадь',ipa:'/hɔːs/',cue:'хор',scene:'Лошадь дирижирует хором. У каждого певца лошадиные уши, а вместо нот изо рта вылетают подковы.'},
{en:'house',ru:'дом',ipa:'/haʊs/',cue:'хаос',scene:'В доме полный хаос: крыша внизу, дверь наверху, окна крутятся. Сам дом удивлённо качает трубой.'},
{en:'milk',ru:'молоко',ipa:'/mɪlk/',cue:'мелкий',scene:'Молоко стало мелким-мелким: вместо одной бутылки на столе стоит сотня крошечных бутылочек.'},
{en:'mouse',ru:'мышь',ipa:'/maʊs/',cue:'Маус',scene:'Мышь примеряет огромные круглые уши Микки Мауса. Уши перевешивают, и мышь кувыркается на спину.'},
{en:'nest',ru:'гнездо',ipa:'/nest/',cue:'нести',scene:'Гнездо само несёт огромную корзину яиц. Из гнезда выросли лапки, и оно осторожно шагает по ветке.'},
{en:'orange',ru:'апельсин',ipa:'/ˈɒrɪndʒ/',cue:'оранжевый',scene:'Апельсин взял кисть и красит всё вокруг в оранжевый цвет: даже облако стало оранжевым.'},
{en:'pan',ru:'сковорода',ipa:'/pæn/',cue:'панда',scene:'Панда катается на сковороде, как на санках. Ручка сковороды стала рулём, а панда машет лапами.'},
{en:'rabbit',ru:'кролик',ipa:'/ˈræbɪt/',cue:'рэп + бит',scene:'Кролик читает рэп под громкий бит. Его длинные уши подпрыгивают в такт, а лапы стучат по барабану.'},
{en:'ship',ru:'корабль',ipa:'/ʃɪp/',cue:'шип',scene:'Корабль плывёт по морю, а вместо мачты у него огромный шип. На шип накололось облако.'},
{en:'shoe',ru:'туфля',ipa:'/ʃuː/',cue:'шуба',scene:'Туфля надела пушистую шубу. Из рукавов торчат шнурки, а каблук утонул в мехе.'},
{en:'snake',ru:'змея',ipa:'/sneɪk/',cue:'снег',scene:'Змея ползёт по снегу и лепит хвостом снежки. На голове у неё снежная корона.'},
{en:'table',ru:'стол',ipa:'/ˈteɪbəl/',cue:'табель',scene:'Стол получил огромный табель с пятёрками. От радости его ножки танцуют, а табель хлопает как флаг.'},
{en:'window',ru:'окно',ipa:'/ˈwɪndəʊ/',cue:'винт + дом',scene:'Окно прикрутило к себе гигантский винт. Винт закрутился, и окно вылетело из дома как вертолёт.'},
{en:'train',ru:'поезд',ipa:'/treɪn/',cue:'тренер',scene:'Тренер заставил поезд делать зарядку. Вагоны поднимаются и опускаются, а колёса растягиваются как руки.'},
{en:'clock',ru:'часы',ipa:'/klɒk/',cue:'клок',scene:'Из часов вылез огромный клок шерсти. Он намотался на стрелки, и часы стали пушистыми.'},
{en:'cow',ru:'корова',ipa:'/kaʊ/',cue:'каучук',scene:'Корова стала каучуковой: она прыгает как резиновый мяч. Хвост пружинит, а пятна растягиваются.'},
{en:'car',ru:'машина',ipa:'/kɑː/',cue:'кар!',scene:'Машина открыла капот как клюв и закричала «Кар!». Из выхлопной трубы полетели вороньи перья.'},
{en:'bell',ru:'колокольчик',ipa:'/bel/',cue:'белка',scene:'Белка качается внутри колокольчика вместо язычка. Каждый прыжок белки вызывает громкий звон.'},
{en:'foot',ru:'ступня',ipa:'/fʊt/',cue:'футбол',scene:'Огромная ступня играет в футбол. Мяч размером с горошину отлетает от пальцев выше ворот.'},
{en:'eye',ru:'глаз',ipa:'/aɪ/',cue:'ай!',scene:'Глаз увидел яркую вспышку и воскликнул «Ай!». Над ним подпрыгнула бровь, а ресницы встали дыбом.'},
{en:'ear',ru:'ухо',ipa:'/ɪə/',cue:'ириска',scene:'Огромная ириска прилипла к уху. Ухо тянет её как жвачку, и получается длинная сладкая лента.'},
{en:'tooth',ru:'зуб',ipa:'/tuːθ/',cue:'туз',scene:'Зуб вытянул из колоды гигантского туза. Карта застряла между двумя зубами, как закладка.'}
);
const cloud=(x,y)=>circle(x-23,y+6,22,'#bdd7d0')+circle(x+7,y-6,31,'#bdd7d0')+circle(x+33,y+9,22,'#bdd7d0');
const bottle=()=>rect(-22,-58,44,99,'#fffdf4',8)+rect(-11,-75,22,22,'#84aaa0')+rect(-21,-21,42,38,'#c6ddd1',0);
const rabbitShape=()=>ellipse(-17,-51,12,40,cream)+ellipse(17,-51,12,40,cream)+circle(0,-8,33,cream)+eyes(0,-13)+ellipse(0,47,43,42,cream)+ellipse(-41,75,26,13,cream)+ellipse(41,75,26,13,cream);
const birdShape=()=>ellipse(0,18,42,28,'#88b9b3')+circle(-28,-9,24,'#88b9b3')+svgPath('M-49 -8 L-69 1 L-48 7Z',orange)+circle(-32,-15,3,ink)+svgPath('M15 11 L38 -32 L50 -15Z','#a4c9c0')+svgPath('M33 25 L60 14 L59 40Z','#88b9b3');
const toothShape=()=>svgPath('M-38 -28 Q-42 -62 -12 -58 Q0 -47 16 -58 Q52 -59 40 -22 L22 54 Q10 77 0 13 Q-10 77 -25 52Z','#fffdf4');
const doorShape=()=>rect(-40,-80,80,150,orange)+rect(-30,-67,60,128,cream)+circle(19,0,5,ink);
const chairShape=()=>rect(-39,-68,78,62,cream)+svgPath('M-43 -2 L43 -2 M-35 0 L-35 66 M35 0 L35 66 M-30 -5 L-30 -55 M30 -5 L30 -55','none',ink,9);
const carShape=()=>svgPath('M-80 7 L-62 -24 L-30 -27 L-10 -53 L39 -53 L63 -25 L80 -21 L80 25 L-80 25Z','#85b7b2')+circle(-47,28,20,ink)+circle(47,28,20,ink)+svgPath('M-14 -45 L33 -45 L47 -27 L-26 -27Z','#e3eee4');
const legFoot=()=>svgPath('M-18 -69 L18 -69 L18 9 Q35 29 66 33 Q90 45 69 61 L-30 61 Q-47 51 -27 25Z',orange);
Object.assign(artBodies,{
ant:()=>group(140,168,ellipse(-33,0,25,20,orange)+circle(7,-9,22,orange)+circle(40,-18,20,orange)+circle(46,-25,3,ink)+svgPath('M-33 10 L-54 45 M-10 9 L-9 45 M17 6 L32 42 M41 -35 L30 -58 M50 -36 L61 -60','none',ink,4))+svgPath('M195 160 L242 54 M208 68 L274 91 M216 48 L280 72 M225 30 L284 50','none',ink,5)+cloud(85,40)+label(180,250,'муравей тащит антенну'),
apple:()=>group(100,135,svgPath('M0 -30 C-65 -75 -75 55 -10 68 Q0 60 10 68 C75 55 65 -75 0 -30Z',orange)+svgPath('M0 -29 L7 -58','none',ink,7)+ellipse(23,-52,20,9,'#9bb874'))+rect(208,62,112,150,'#fffdf4')+[[230,95],[281,125],[244,173]].map(([x,y])=>svgPath(`M${x} ${y} l20 -6 l8 24 l-25 5Z`,orange)).join('')+svgPath('M151 134 L229 117','none',ink,5)+label(180,250,'яблоко делает аппликацию'),
bird:()=>group(130,72,birdShape())+svgPath('M139 111 L196 166','none',ink,3)+svgPath('M197 143 L294 166 L270 223 L174 199Z',cream)+circle(197,160,5,ink)+label(239,190,'БИРКА')+label(180,250,'птица тащит тяжёлую бирку'),
box:()=>rect(102,82,154,127,cream)+svgPath('M100 85 L153 45 L207 85 M102 85 L68 61 L125 25 L154 45Z','#fffdf4')+group(68,147,circle(0,0,25,orange)+rect(-18,20,36,19,orange))+group(293,147,circle(0,0,25,orange)+rect(-18,20,36,19,orange))+svgPath('M105 157 L88 153 M256 157 L270 153','none',ink,6)+star(246,50)+label(180,250,'коробка занимается боксом'),
chair:()=>group(180,118,chairShape(),.78)+svgPath('M71 144 Q180 260 288 144 Q180 190 71 144Z','#85b7b2')+svgPath('M287 147 L331 37','none',ink,12)+label(180,250,'черпак зачерпнул стул'),
cheese:()=>ellipse(180,201,111,19,orange)+rect(70,164,220,38,cream)+ellipse(180,164,110,22,'#fffdf4')+group(180,84,svgPath('M-50 30 L-48 -22 L48 4 L48 54Z',cream)+circle(-25,11,9,orange)+circle(2,26,7,orange)+circle(28,38,9,orange))+splash(180,155)+label(180,250,'сыр прыгает на чизкейке'),
coat:()=>group(180,70,catFace(),.65)+svgPath('M148 112 L212 112 L239 154 L217 165 L217 219 L143 219 L143 165 L121 154Z',ink)+[152,191].map(x=>rect(x,159,24,22,cream)).join('')+svgPath('M162 172 Q106 155 118 197 M202 172 Q255 163 248 202','none',orange,9)+label(180,250,'кот в пальто с хвостами'),
door:()=>svgPath('M80 219 L149 38 L213 38 L293 219Z','#bdc6b7')+svgPath('M180 45 L180 217','none','#fffdf4',4)+group(180,117,doorShape(),.85)+group(69,194,carShape(),.38)+label(180,250,'дверь перегородила дорогу'),
horse:()=>group(165,86,svgPath('M-38 65 L-38 2 L-6 -26 L19 -17 L38 41 L12 48 L-6 26 L-6 65Z',orange)+svgPath('M-12 -24 L-20 -48 L-2 -33Z',orange)+circle(2,-6,4,ink))+svgPath('M160 144 L108 174 M168 142 L232 100','none',ink,8)+[70,150,235,296].map(x=>group(x,208,circle(0,-11,15,cream)+svgPath('M-10 -23 L-16 -40 L-2 -26 M8 -23 L16 -40 L2 -26',cream))).join('')+label(180,250,'лошадь дирижирует хором'),
house:()=>group(180,122,`<g transform="rotate(180)">${house()}</g>`)+group(117,162,rect(-19,-19,38,38,'#85b7b2'))+group(247,143,rect(-18,-18,36,36,'#85b7b2'))+svgPath('M73 89 Q46 138 73 183 M289 78 Q321 122 293 164','none',orange,3)+label(180,250,'в доме полный хаос'),
milk:()=>[[65,90],[128,90],[191,90],[254,90],[97,180],[160,180],[223,180],[286,180]].map(([x,y])=>group(x,y,bottle(),.53)).join('')+label(180,250,'молоко стало мелким-мелким'),
mouse:()=>group(180,148,circle(-57,-62,45,ink)+circle(57,-62,45,ink)+ellipse(0,0,53,44,cream)+eyes(0,-3)+circle(0,14,8,orange)+svgPath('M-14 27 Q0 40 14 27')+svgPath('M-42 20 L-90 12 M42 20 L90 12'))+label(180,250,'мышь надела уши Мауса'),
nest:()=>svgPath('M76 140 Q180 244 283 140 L267 186 Q180 231 92 184Z',orange)+[126,176,226].map(x=>ellipse(x,130,27,36,'#fffdf4')).join('')+svgPath('M125 200 L116 224 M225 200 L237 224 M76 157 Q46 104 106 100 M283 158 Q317 109 257 101','none',ink,7)+label(180,250,'гнездо само несёт яйца'),
orange:()=>circle(115,154,64,orange)+svgPath('M110 91 L123 75','none',ink,5)+ellipse(134,83,19,8,'#95b575')+cloud(258,71)+svgPath('M179 144 L248 98','none',ink,8)+svgPath('M239 104 L256 79 L270 92 L252 115Z',orange)+circle(256,65,22,orange)+label(180,250,'апельсин красит в оранжевый'),
pan:()=>ellipse(180,204,118,18,ink)+svgPath('M283 202 L338 162','none',ink,13)+group(180,129,circle(-30,-43,20,ink)+circle(30,-43,20,ink)+circle(0,-5,45,'#fffdf4')+ellipse(-17,-9,12,17,ink)+ellipse(17,-9,12,17,ink)+circle(0,13,7,ink)+ellipse(0,60,48,35,'#fffdf4'))+label(180,250,'панда едет на сковороде'),
rabbit:()=>group(144,121,rabbitShape(),.95)+rect(244,152,63,57,orange)+ellipse(276,152,33,9,cream)+svgPath('M181 163 L245 134 M104 161 L78 128','none',ink,6)+circle(76,118,12,ink)+label(180,250,'кролик: рэп под бит'),
ship:()=>svgPath('M69 164 L293 164 L263 207 L108 207Z',orange)+svgPath('M174 163 L183 39 L197 164Z',ink)+cloud(197,73)+svgPath('M37 219 Q62 205 87 219 T137 219 T187 219 T237 219 T287 219 T337 219','none','#85b7b2',7)+label(180,250,'у корабля мачта-шип'),
shoe:()=>svgPath('M94 142 L119 91 L171 91 L201 142 L236 158 Q291 173 274 206 L95 206Z',orange)+svgPath('M128 82 L168 82 L197 139 L174 152 L178 187 L120 187 L121 148 L100 137Z',cream)+[124,144,164,183].map(x=>circle(x,139,14,'#fffdf4')).join('')+label(180,250,'туфля надела шубу'),
snake:()=>svgPath('M44 210 Q180 160 322 210','none','#fffdf4',24)+svgPath('M77 174 C188 232 239 131 163 139 S98 83 198 106 Q250 118 280 78','none','#99b677',22)+circle(282,70,18,'#99b677')+circle(287,64,3,ink)+[82,139,206].map(x=>circle(x,212,16,'#fffdf4')).join('')+label(180,250,'змея лепит снежки'),
table:()=>rect(64,145,225,22,orange)+svgPath('M83 165 L83 223 M270 165 L270 223','none',ink,13)+rect(125,40,115,115,'#fffdf4')+label(182,65,'ТАБЕЛЬ')+label(182,98,'5   5   5')+label(182,126,'5   5   5')+label(180,250,'стол радуется табелю'),
window:()=>group(81,140,house(),.65)+rect(207,84,91,112,'#c2dcd2')+svgPath('M252 84 L252 196 M207 140 L298 140','none',ink,7)+svgPath('M252 84 L252 46 M192 42 L313 42','none',ink,7)+svgPath('M161 103 L185 103 M155 139 L185 139','none',orange,4)+label(180,250,'винт уносит окно из дома'),
train:()=>rect(112,110,180,76,'#85b7b2')+rect(117,91,41,39,cream)+rect(171,91,41,39,cream)+rect(225,91,41,39,cream)+[144,207,264].map(x=>circle(x,192,17,ink)).join('')+group(62,128,person(),.7)+svgPath('M145 208 L131 226 M263 209 L279 227','none',ink,7)+label(180,250,'тренер: поезд на зарядке'),
clock:()=>circle(180,125,92,cream)+circle(180,125,81,'#fffdf4')+svgPath('M180 125 L153 78 M180 125 L230 105','none',ink,6)+[ [135,132],[163,105],[204,134],[187,160]].map(([x,y])=>circle(x,y,25,'#adb899')).join('')+label(180,250,'клок шерсти обвил стрелки'),
cow:()=>ellipse(170,140,91,52,'#fffdf4')+ellipse(262,133,33,43,'#fffdf4')+ellipse(266,155,32,20,orange)+circle(267,120,3,ink)+circle(140,124,23,ink)+circle(199,155,18,ink)+svgPath('M117 180 Q99 202 128 215 M214 180 Q235 199 213 218 M233 102 L223 80 M280 97 L297 77','none',ink,6)+label(180,250,'каучуковая корова пружинит'),
car:()=>group(180,169,carShape(),1.2)+svgPath('M88 143 L102 94 L151 129Z',orange)+rect(235,57,90,42,'#fffdf4')+label(280,84,'КАР!')+svgPath('M298 184 Q328 177 312 151','none',ink,5)+label(180,250,'машина каркает как ворона'),
bell:()=>svgPath('M83 184 Q119 168 120 95 Q180 12 240 95 Q242 170 278 184Z',cream)+ellipse(180,187,97,20,orange)+group(182,137,ellipse(0,14,26,34,orange)+circle(-2,-19,22,orange)+svgPath('M-19 -33 L-21 -53 L-4 -38Z',orange)+circle(-8,-23,3,ink)+svgPath('M23 36 Q77 45 63 -5 Q48 -29 31 -1','none',orange,15))+label(180,250,'белка звонит в колокольчик'),
foot:()=>group(117,146,legFoot())+group(263,171,ballShape(),.5)+svgPath('M220 137 L235 128 M218 158 L235 158','none',orange,4)+label(180,250,'ступня играет в футбол'),
eye:()=>svgPath('M65 132 Q180 16 296 132 Q180 236 65 132Z','#fffdf4')+circle(180,131,48,'#85b7b2')+circle(180,131,22,ink)+svgPath('M65 90 L52 61 M104 65 L99 31 M255 90 L282 51','none',ink,5)+label(290,40,'АЙ!')+star(48,130)+label(180,250,'глаз воскликнул «ай!»'),
ear:()=>svgPath('M139 209 Q88 174 105 91 C121 15 263 49 237 125 Q232 155 194 169 Q176 239 139 209Z',orange)+svgPath('M141 160 Q118 90 172 84 Q224 82 204 127 L170 142')+svgPath('M198 151 Q273 111 293 164 Q272 198 208 178Z',cream)+rect(265,155,53,33,cream)+label(180,250,'ириска прилипла к уху'),
tooth:()=>group(134,142,toothShape(),1.15)+group(234,108,rect(-36,-68,72,137,'#fffdf4')+label(0,-40,'ТУЗ')+svgPath('M0 -14 L18 16 L0 39 L-18 16Z',orange))+label(180,250,'зуб вытянул туза')
});

// Append only: interrupted sessions retain their numeric word positions.
words.push(...WordSceneContent.cards);
window.WS17_illustration=illustration;
})();
