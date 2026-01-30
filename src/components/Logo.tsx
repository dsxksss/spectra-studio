import logoUrl from "../assets/logo.png";

interface LogoProps {
    className?: string;
    size?: number;
}

const Logo: React.FC<LogoProps> = ({
    className = '',
    size = 40
}) => {
    return (
        <div
            className={`relative inline-flex items-center justify-center overflow-hidden rounded-full ${className}`}
            style={{ width: size, height: size }}
        >
            <img
                src={logoUrl}
                alt="Logo"
                className="w-full h-full object-contain"
            />
        </div>
    );
};

export default Logo;
