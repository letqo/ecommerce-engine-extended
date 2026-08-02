function ErrorPage() {
  return null
}

ErrorPage.getInitialProps = () => ({ statusCode: 500 })

export default ErrorPage
