/** Display helpers for notifications (no API calls). */
import {AlarmClock,ArrowRight,CircleCheck,RotateCcw} from 'lucide-react';

/** Tone/icon from the Laravel notification type + message words (display only). */
export function notificationKind(row){
  const text=`${row?.type??''} ${row?.message??''}`.toLowerCase();
  if(/return|reject|correction/.test(text))return {key:'returned',label:'Returned',tone:'red',Icon:RotateCcw};
  if(/remind|deadline|due|overdue/.test(text))return {key:'reminder',label:'Reminder',tone:'amber',Icon:AlarmClock};
  if(/publish|\bapproved\b/.test(text))return {key:'published',label:'Published',tone:'green',Icon:CircleCheck};
  return {key:'workflow',label:'Workflow',tone:'blue',Icon:ArrowRight};
}
