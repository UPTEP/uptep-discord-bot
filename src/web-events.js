// Save to the existing durable notification queues before acknowledging the event.
export async function receiveWebEvents({api,notifications,convoyNotifications}) {
 const {events}=await api.request('/notifications-web');
 for(const event of events){
  if(event.kind==='validation')notifications.enqueue(event.payload.demande);
  else if(event.kind==='convoi')convoyNotifications.enqueue(event.payload);
  else throw new Error('Unknown web event');
  await api.request('/notifications-web',{body:{id:event.id}});
 }
}
