function c(s){const o=[];let e="",r=[],i=!1;for(let t=0;t<s.length;t+=1){const n=s[t],u=s[t+1];if(n==='"'){i&&u==='"'?(e+='"',t+=1):i=!i;continue}if(!i&&n===","){r.push(e.trim()),e="";continue}if(!i&&(n===`
`||n==="\r")){n==="\r"&&u===`
`&&(t+=1),r.push(e.trim()),o.push(r),e="",r=[];continue}e+=n}return(e||r.length)&&(r.push(e.trim()),o.push(r)),o.filter(t=>t.some(n=>n.trim().length))}export{c as p};
