import "./globals.css";

export const metadata = {
  title: "DynoCode — Learn Python by Doing",
  description:
    "A beginner-friendly coding practice platform. Solve Python problems with an interactive editor, run your code, and verify against test cases.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
