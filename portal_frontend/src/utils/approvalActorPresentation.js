/** Read-only actor resolution for recorded Laravel approval events.
 * Actor identity comes from actor_id (or documented camelCase aliases), not
 * from the required workflow role. Never infer identity from role/step.
 */
import {personName,readField} from './serverFields.js';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const found=(...values)=>values.find(value=>value!==undefined&&value!==null&&value!=='');
const idOf=value=>{
  const raw=typeof value==='object'&&value!==null?value.id:value;
  const id=Number(raw);
  return Number.isSafeInteger(id)&&id>0?String(id):'';
};

export function approvalEventActorId(entry){
  return idOf(found(readField(entry,'actor_id','actorId','user_id','userId',
    'reviewer_id','reviewerId','performed_by_id','performedById','performed_by_user_id','performedByUserId','actor_id','actorUser.id','actor_user.id','performedByUser.id','performed_by_user.id','actor.id',
    'user.id','reviewer.id','performedBy.id','performed_by.id','by.id','performedByUser.userId','performed_by_user.user_id','user.userId','actor.userId'),null));
}

export function approvalUploaderId(file){
  return idOf(found(readField(file,'uploaded_by_id','uploadedById',
    'uploader_id','uploaderId','created_by_id','createdById',
    'uploadedBy.id','uploaded_by.id','createdBy.id','created_by.id'),null));
}

export function approvalActorIds(record){
  const raw=object(record?.raw);
  const history=Array.isArray(record?.history)?record.history:[];
  const files=found(raw.attachments,raw.documents,raw.supportingDocuments,
    raw.supporting_documents,raw.files,[]);
  const documents=Array.isArray(files)?files:Array.isArray(files?.data)?files.data:[];
  const ids=[...history.map(approvalEventActorId),
    idOf(found(raw.submitted_by_id,raw.submittedById,raw.submittedBy?.id,raw.submitted_by?.id)),
    ...documents.map(approvalUploaderId)];
  return [...new Set(ids.filter(Boolean))];
}

const roleText=value=>{
  if(typeof value==='string')return value.trim();
  const entry=object(value);
  return String(found(entry.name,entry.title,entry.displayName,entry.display_name,
    entry.label,entry.code,entry.role_code,entry.roleCode)??'').trim();
};

export function profileOf(user){
  const person=object(user);
  const name=personName(person) || '';
  const roles=Array.isArray(person.roles)?person.roles:[];
  const position=found(person.jobTitle,person.job_title,person.position,
    person.designation,person.title,'');
  const roleNames=[
    ...(position?[String(position).trim()]:[]),
    ...roles.map(roleText),
    roleText(found(person.role,person.roleName,person.role_name,
      person.roleCode,person.role_code,'')),
  ].filter(Boolean);
  // Laravel actor snapshots use userId (history[].actor, submittedBy); user records use id.
  return {id:idOf(found(person.id,person.userId,person.user_id)),name,role:[...new Set(roleNames)].join(' / ')};
}

export function indexedActorProfiles(users){
  return Object.fromEntries((Array.isArray(users)?users:[]).map(profileOf)
    .filter(user=>user.id).map(user=>[user.id,user]));
}

/** A backend role label from an approval step is not a person's profile role. */
export function displayApprovalActor({actorId,actor,role}={},profiles={}){
  const source=object(actor);
  const key=idOf(actorId)||idOf(found(source.id,source.userId,source.user_id));
  const profile=key?profiles[key]:null;
  const embedded=profileOf(source);
  return {
    name:profile?.name||embedded.name||personName(actor)||(
      typeof actor==='string'&&actor.trim()&&!/^(?:user\s*#?|#)?\d+$/i.test(actor.trim())?actor.trim():'')||
      (key?'Name unavailable in response':'Name unavailable in response'),
    role:profile?.role||embedded.role||roleText(role)||'',
  };
}

/** Traverse confirmed paginated GET /users responses until the actors for the
 * current submission are found. Read-only; no unconfirmed user-detail route. */
export async function findApprovalActorsPaged(actorIds,fetchPage){
  const requested=new Set((actorIds??[]).map(String).filter(id=>/^\d+$/.test(id)));
  if(!requested.size)return {};
  const matches={};
  for(let page=1;page<=30&&requested.size;page++){
    const result=await fetchPage({page,perPage:100});
    const indexed=indexedActorProfiles(result.items);
    for(const id of [...requested]){
      if(indexed[id]){matches[id]=indexed[id];requested.delete(id);}
    }
    if(!(result.paginated&&Number(result.lastPage)>page))break;
  }
  return matches;
}

/** Collect actor profiles already embedded in Laravel's submission/history response.
 * This works for IDO/DDO even when GET /users is restricted. */
export function embeddedApprovalActorProfiles(record){
  const raw=object(record?.raw);
  const history=Array.isArray(record?.history)?record.history:[];
  const candidates=[
    raw.submittedBy,raw.submitted_by,raw.submitter,raw.createdBy,raw.created_by,
    raw.user,raw.officer,
    ...history.flatMap(event=>[
      event.user,event.actor,event.reviewer,event.performedBy,event.performed_by,
      event.performedByUser,event.performed_by_user,event.actorUser,event.actor_user,
      event.userDetails,event.user_details,event.actionBy,event.action_by,
      event.by,event.initiator,
    ]),
  ];
  const profiles=indexedActorProfiles(candidates.filter(item=>item&&typeof item==='object'));
  for(const event of history){
    const id=approvalEventActorId(event);
    if(!id || profiles[id])continue;
    const embedded=profileOf(event);
    if(embedded.name)profiles[id]={...embedded,id};
  }
  return profiles;
}
