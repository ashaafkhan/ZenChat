import { startNewChat } from '@/features/home/actions/start-new-chat'
import { redirect } from 'next/navigation'


const page = async () => {
  const { conversationId, branchId } = await startNewChat()

  redirect(`/c/${conversationId}?branch=${branchId}`)
}

export default page