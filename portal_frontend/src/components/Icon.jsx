import React from 'react';
export default function Icon({ name, size = 22 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true }
  const icons = {
    globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18M5 7h14M5 17h14"/></>,
    inbox:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 13h5l2 3h4l2-3h5"/></>,
    api:<><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><rect x="16" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M5 16v-4h14v4M12 12v4"/></>,
    chart:<><path d="M4 20V12h4v8M10 20V7h4v13M16 20V3h4v17"/></>,
    doc:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    shield:<><path d="M12 2l8 4v5c0 6-3.5 9-8 11-4.5-2-8-5-8-11V6zM9 12l2 2 4-4"/></>,
    mail:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/></>,
    lock:<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    eye:<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/></>,
    chevron:<path d="m6 9 6 6 6-6"/>,
    arrow:<><path d="M4 12h16m-6-6 6 6-6 6"/></>
  }
  return <svg {...common}>{icons[name]}</svg>
}
