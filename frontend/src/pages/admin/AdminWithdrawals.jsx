import React,{useEffect,useState}from'react';
import{RefreshCw,Landmark,Clock3,CheckCircle2,Banknote}from'lucide-react';
import{AdminLayout,PageHeader,Stat,api,formatMoney,Button,Badge,useApp}from'../../shared';

export default function AdminWithdrawals(){
  const{notify}=useApp();const[d,setD]=useState({withdrawals:[],summary:[]});const[busy,setBusy]=useState('');
  async function load(){try{const r=await api('/admin/withdrawals');setD(r.data)}catch(e){notify(e.message)}}useEffect(()=>{load()},[]);
  const summary=status=>d.summary?.find(x=>x._id===status)||{amount:0,count:0};
  async function act(id,action){
    let body={};
    if(action==='paid'){const transferReference=window.prompt('Enter your bank transfer/reference number');if(!transferReference)return;body={transferReference}}
    if(action==='reject'){const adminNote=window.prompt('Reason for rejection (optional)')||'';body={adminNote}}
    setBusy(`${id}-${action}`);try{await api(`/admin/withdrawals/${id}/${action}`,{method:'PATCH',body:JSON.stringify(body)});notify({title:action==='paid'?'Withdrawal paid':action==='approve'?'Withdrawal approved':'Withdrawal rejected',message:action==='reject'?'Driver funds were returned to the wallet.':'Status updated successfully.',tone:'success'});await load()}catch(e){notify(e.message)}finally{setBusy('')}
  }
  return <AdminLayout>
    <PageHeader title="Driver Withdrawals" subtitle="Review driver payout requests and record manual bank transfers." action={<Button onClick={load} variant="secondary"><RefreshCw size={16}/>Refresh</Button>}/>
    <div className="stats"><Stat title="Pending" value={`${summary('pending').count} · ${formatMoney(summary('pending').amount)}`} icon={Clock3}/><Stat title="Approved" value={`${summary('approved').count} · ${formatMoney(summary('approved').amount)}`} icon={CheckCircle2}/><Stat title="Paid" value={formatMoney(summary('paid').amount)} icon={Banknote}/><Stat title="Rejected" value={formatMoney(summary('rejected').amount)} icon={Landmark}/></div>
    <div className="panel table-wrap"><table><thead><tr><th>Driver</th><th>Amount</th><th>Bank account</th><th>Status</th><th>Requested</th><th>Actions</th></tr></thead><tbody>{(d.withdrawals||[]).map(x=><tr key={x._id}><td><b>{x.driver?.fullName||'Driver'}</b><br/><small>{x.driver?.phone||''}</small></td><td>{formatMoney(x.amount)}</td><td>{x.bank?.bankName}<br/><small>{x.bank?.accountName} · {x.bank?.accountNumber}</small></td><td><Badge tone={x.status==='paid'?'success':x.status==='rejected'?'danger':'warning'}>{x.status}</Badge>{x.transferReference&&<><br/><small>Ref: {x.transferReference}</small></>}</td><td>{new Date(x.createdAt).toLocaleString('en-NG')}</td><td><div className="admin-withdraw-actions">{x.status==='pending'&&<Button onClick={()=>act(x._id,'approve')} disabled={!!busy}>Approve</Button>}{['pending','approved'].includes(x.status)&&<Button onClick={()=>act(x._id,'reject')} variant="danger" disabled={!!busy}>Reject</Button>}{x.status==='approved'&&<Button onClick={()=>act(x._id,'paid')} disabled={!!busy}>Mark Paid</Button>}</div></td></tr>)}</tbody></table>{!d.withdrawals?.length&&<p className="muted">No withdrawal requests yet.</p>}</div>
  </AdminLayout>
}
