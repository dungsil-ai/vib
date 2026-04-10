import { redirect } from 'next/navigation'

export default function NewTransactionRedirect() {
  redirect('/transactions')
}

