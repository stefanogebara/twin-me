import { useNavigate } from 'react-router-dom';
import { PresenceExperience } from './preview/PresencePrototype';

export default function PresencePage() {
  const navigate = useNavigate();

  return <PresenceExperience persistDraft onExit={() => navigate('/presence')} />;
}
