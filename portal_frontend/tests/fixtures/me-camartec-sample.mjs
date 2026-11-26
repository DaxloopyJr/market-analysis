// Sample Laravel-shaped payloads built from the CAMARTEC Excel (used for tests + screenshots)
export const OBJ = [['A','Health Services Improved and HIV/AIDS',5,2,12.5,15475000,1000000],['B','National Anti-Corruption Strategy Implemented',5,1,25,4075000,0],
['C','Applied Research and Development for Agricultural Mechanization',30,7,47.9,1702796933,74698468],['D','Agricultural Mechanization and Rural Technology Promoted',25,3,100,155514440,42649750],
['E','Testing of Agricultural Machinery and Technologies',20,1,100,420000000,193512011],['F','Good Governance and Administration Services',15,6,100,191225875,51225875]];
export const KPI = [
['A','Number of meetings conducted by the committee',4,[0,0,0,1],25,'DHRA',8225000,1000000],
['A','Number of awareness sessions conducted',4,[0,0,0,0],0,'DHRA',7250000,0],
['B','Number of officials trained on anti-corruption',4,[0,0,0,1],25,'DHRA',4075000,0],
['C','Agricultural technologies fabricated',100,[5,10,10,60],85,'Research',470000000,72178468],
['C','Prototype planter models designed',4,[0,0,0,0],0,'Research',28676933,0],
['C','Rural technologies fabricated',6,[0,2,3,2],116.7,'Research',54120000,2520000],
['C','Mobile processing model factories',3,[0,0,0,1],33.3,'Research',350000000,0],
['C','Mobile processing factories established',2,[0,0,0,1],50,'Research',300000000,0],
['C','Palm oil processors supported',1,[0,0,0,0],0,'Research',300000000,0],
['C','Centre buildings repaired',100,[0,0,0,50],50,'Estates',200000000,0],
['D','Consultancy sessions and trainings',10,[10,30,8,5],530,'Extension',30000000,11453750],
['D','Consultancy sessions conducted',50,[10,21,38,30],198,'Extension',45514440,31196000],
['D','Publicity and outreach activities',100,[0,0,0,80],80,'Extension',80000000,0],
['E','Agricultural machines tested',100,[5,7,10,80],102,'Testing',420000000,193512011],
['F','Staff receiving training',79,[0,0,0,70],88.6,'DHRA',50000000,0],
['F','Legal documents prepared',10,[0,0,0,0],0,'Legal',30000000,0],
['F','Development projects monitored',7,[0,0,22,6],400,'Planning',27087500,27087500],
['F','ICT systems supported',10,[10,30,30,3],730,'ICT',24138375,24138375],
['F','Projects monitored and evaluated',7,[0,0,0,3],42.9,'Planning',50000000,0],
['F','Development projects audited',9,[0,0,0,0],0,'Audit',10000000,0]];
const objName = c => OBJ.find(o=>o[0]===c)[1];
export function payloads(){
  const objectives={type:'strategic-objective',generatedAt:'2026-10-29T12:00:00Z',rows:OBJ.map(([c,n,w,k,s,b,e])=>({strategicObjective:`${c} - ${n}`,indicators:k,submissions:4,institutions:1,deliveryPercent:s,compositeScore:s,fullyAchieved:0,underperforming:0,approvedBudget:b,actualExpenditure:e,budgetUtilisationPercent:Math.round(e/b*1000)/10,deliveryGap:null,rating:s>=80?'Green':s>=60?'Amber':'Red',weight:w})),summary:{compositeScore:76.2,rating:'Amber - Moderate',indicators:20,submissions:4}};
  const indicators={rows:KPI.map(([c,n,t,q,a,d,b,e],i)=>({indicatorId:100+i,indicatorCode:`CAM/IND/${i+1}`,indicatorName:n,unit:'Number',strategicObjective:`${c} - ${objName(c)}`,institutionName:'CAMARTEC',institutionId:9,departmentName:d,datasetName:'CAMARTEC Performance',periodLabel:'2025/2026 Q4',reportingPeriodId:4,baseline:0,target:t,actual:q[3],achievementPercent:a,rating:a>=80?'On track':'Below',approvedBudget:b,actualExpenditure:e,
    achievements:i===10?'Consultancy sessions and trainings: 53 against a target of 10.':i===13?'102 agricultural machines tested against 100 planned.':null,
    implementationChallenges:[4,6,8].includes(i)?'Delayed disbursement of development funds from Treasury.':null,correctiveActions:[4,6].includes(i)?'Follow up releases monthly and re-phase activities to Q1 2026/27.':null})),summary:{indicators:20,deliveryPercent:76.2,fullyAchieved:6,underperforming:11}};
  const cum=(q,n)=>q.slice(0,n).reduce((a,b)=>a+b,0);
  const trend={rows:KPI.flatMap(([c,n,t,q,a,d],i)=>[1,2,3,4].map(p=>({indicatorId:100+i,indicatorName:n,strategicObjective:`${c} - ${objName(c)}`,institutionId:9,institutionName:'CAMARTEC',departmentName:d,periodLabel:`2025/2026 Q${p}`,target:t,actual:q[p-1],cumulativeActual:cum(q,p),cumulativeAchievementPercent:p===4?a:Math.round(cum(q,p)/t*1000)/10})))};
  const exceptions={rows:indicators.rows.filter(r=>r.achievementPercent<80).map(r=>({...r,exceptionType:r.achievementPercent===0?'zero delivery':'underperformance'})),summary:{exceptions:11}};
  const budget={rows:[],summary:{approvedBudget:2489087248,actualExpenditure:363086104,budgetUtilisationPercent:14.6,deliveryPercent:76.2}};
  const deps=[...new Set(KPI.map(k=>k[5]))];
  const departments={rows:deps.map(d=>{const ks=KPI.filter(k=>k[5]===d);const s=Math.round(ks.reduce((a,k)=>a+Math.min(100,k[4]),0)/ks.length*10)/10;return {departmentName:d,indicators:ks.length,deliveryPercent:s,compositeScore:s,fullyAchieved:ks.filter(k=>k[4]>=100).length,underperforming:ks.filter(k=>k[4]<80).length,rating:s>=80?'Green':s>=60?'Amber':'Red'};})};
  return {objectives,indicators,trend,exceptions,budget,departments};
}
