export const Footer = () => {
  return (
    <footer className="py-12 bg-muted/20 border-t border-border/50">
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-8">
          <a 
            href="#about" 
            className="text-muted-foreground hover:text-foreground transition-colors duration-200 text-sm"
          >
            About
          </a>
          <div className="hidden sm:block w-px h-4 bg-border" />
          <a 
            href="#privacy" 
            className="text-muted-foreground hover:text-foreground transition-colors duration-200 text-sm"
          >
            Privacy
          </a>
          <div className="hidden sm:block w-px h-4 bg-border" />
          <a 
            href="#early-access" 
            className="text-muted-foreground hover:text-foreground transition-colors duration-200 text-sm"
          >
            Get Early Access
          </a>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-xs text-muted-foreground">
            © 2024 Twin Me. Built with Lovable.
          </p>
        </div>
      </div>
    </footer>
  );
};