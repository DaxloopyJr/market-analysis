/** AO pages are allowed only for the institution Account Officer role.
 * Laravel still enforces submission scope, active workflow and self-review. */
import {Navigate,useOutletContext} from 'react-router-dom';
import {isAccountOfficer} from '../utils/aoApprovalRules';
export default function AoAccess({children}) {
  const {user}=useOutletContext();
  return isAccountOfficer(user)?children:<Navigate to="/dashboard" replace/>;
}
