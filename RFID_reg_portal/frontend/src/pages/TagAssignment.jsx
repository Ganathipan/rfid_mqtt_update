import { useState } from 'react';
import { api } from '../api';
import MemberAssignment from './MemberAssignment';
import AdminPanel from './AdminPanel';

export default function TagAssignment({ registrationData, selectedPortal, onComplete }) {
  const [step, setStep] = useState('leader'); // leader | members
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const isIndividual = registrationData?.type === 'individual';
  const totalMembers = isIndividual ? 1 : (registrationData?.group_size || 0);

  async function submitAndAssign() {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      const res = await api('/api/tags/link', {
        method: 'POST',
        body: {
          portal: selectedPortal,
          leaderId: registrationData.id,
          asLeader: true
        }
      });
      setMsg(`✅ Leader tag assigned: ${res.tagId}`);
      if (isIndividual) {
        onComplete();
      } else {
        setStep('members');
      }
    } catch (e) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  function confirmAndExit() {
    onComplete();
  }

  function startNewRegistration() {
    onComplete();
  }

  if (step === 'members') {
    return (
      <MemberAssignment
        portal={selectedPortal}
        leaderId={registrationData.id}
        memberCount={Math.max(0, totalMembers - 1)}
        onDone={onComplete}
      />
    );
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>RFID Tag Assignment Confirmation</h3>
      <div style={{ marginTop: 16 }}>
        <b>Portal:</b> {selectedPortal}<br />
        <b>Registration Type:</b> {registrationData?.type === 'individual' ? 'Individual' : 'Batch'}<br />
        <b>Number of Cards to Assign:</b> {isIndividual ? 1 : totalMembers}<br />
        {registrationData?.group_size && <><b>Group Size:</b> {registrationData.group_size}<br /></>}
        {registrationData?.province && <><b>Province:</b> {registrationData.province}<br /></>}
        {registrationData?.district && <><b>District:</b> {registrationData.district}<br /></>}
        {registrationData?.school && <><b>School:</b> {registrationData.school}<br /></>}
        {registrationData?.university && <><b>University:</b> {registrationData.university}<br /></>}
        {registrationData?.age_range && <><b>Age Range:</b> {registrationData.age_range}<br /></>}
        {registrationData?.sex && <><b>Sex:</b> {registrationData.sex}<br /></>}
        {registrationData?.lang && <><b>Language:</b> {registrationData.lang}<br /></>}
      </div>
      <div style={{ marginTop: 24 }}>
        <button className="btn primary" onClick={confirmAndExit} disabled={busy}>Confirm and Exit</button>
      </div>
      <div className="small mut" style={{ marginTop: 10 }}>{msg}</div>
      <div className="hr" />
      <AdminPanel/>
    </div>
  );
}