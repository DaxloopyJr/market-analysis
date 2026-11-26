/**
 * FILE: src/components/NetworkLine.jsx
 * Flag-coloured progress line on the topbar's flag stripe (9 Nov 2026, approved mockup A).
 * Appears only when a request has taken longer than 200 ms (quick answers do not flicker), stays at least
 * 400 ms so it never blinks, and fades out when the last request returns.
 */
import {useEffect, useRef, useState} from 'react';
import {subscribeNetwork} from '../utils/networkActivity.js';

export default function NetworkLine() {
  const [visible, setVisible] = useState(false);
  const timers = useRef({show: null, hide: null, since: 0});
  useEffect(() => {
    const t = timers.current;
    const unsubscribe = subscribeNetwork(pending => {
      if (pending > 0) {
        clearTimeout(t.hide);
        if (!t.show) t.show = setTimeout(() => { t.since = Date.now(); setVisible(true); }, 200);
      } else {
        clearTimeout(t.show); t.show = null;
        t.hide = setTimeout(() => setVisible(false), Math.max(0, 400 - (Date.now() - t.since)));
      }
    });
    return () => { unsubscribe(); clearTimeout(t.show); clearTimeout(t.hide); };
  }, []);
  return <div className={`vw-net-line${visible ? ' is-on' : ''}`} role="progressbar" aria-hidden={!visible} aria-label="Loading"/>;
}
