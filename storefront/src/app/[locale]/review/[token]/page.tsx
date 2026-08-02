import ReviewTokenClient from './ReviewTokenClient'

export default async function ReviewTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <ReviewTokenClient token={token} />
}
