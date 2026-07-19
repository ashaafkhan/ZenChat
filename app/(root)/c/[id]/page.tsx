import React from 'react';

type ConversationPageProps = {
    params: Promise<{id: string}>;
};

const page = async({params}: ConversationPageProps) => {
    const {id} = await params;
  return (
    <div>page {id} </div>
  )
}

export default page