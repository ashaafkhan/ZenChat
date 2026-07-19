import { onBoard } from '@/features/auth/action/onboard';
import {auth} from '@clerk/nextjs/server'
import React from 'react'

const RootGrouplayout = async({children}:{children:React.ReactNode}) => {

await auth.protect();
await onBoard();
  return (
    <ChatShell>
        {children}
    </ChatShell>
  )
}

export default RootGrouplayout