import { Link } from "react-router-dom";
import { Card, CardBody } from "../ui/Card.jsx";
import Button from "../ui/Button.jsx";

export default function Confirmation({ title = "Registration Complete", subtitle = "Your team is ready to go!", ctaPath = "/", ctaText = "Back to Home" }) {
  return (
    <div className="min-h-[70vh] grid place-items-center">
      <Card className="w-[min(92vw,720px)] bg-gradient-to-b from-white/[0.02] to-white/[0.01] rounded-3xl">
        <CardBody className="text-center p-8">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-brand-accent/20 grid place-items-center">
            <span className="text-3xl">✅</span>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-white/80">{subtitle}</p>
          <div className="mt-6">
            <Link to={ctaPath}>
              <Button variant="primary" className="rounded-2xl px-6 py-3">{ctaText}</Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
