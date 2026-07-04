export const state = {
  user:null, profile:null, role:null, settings:{companyName:'HR Glass Pro',gpsEnabled:false,lat:null,lng:null,radius:150},
  employees:[], shifts:[], attendance:[], requests:[], payroll:[], transactions:[], unsub:[]
};
export function clearSubs(){ state.unsub.forEach(u=>{try{u()}catch{}}); state.unsub=[]; }
