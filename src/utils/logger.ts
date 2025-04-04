import chalk from "chalk";
import ora from "ora";

/**
 * Logger utility for consistent output formatting
 */
export class Logger {
  private verbose: boolean;
  private spinner = ora();

  constructor(verbose: boolean = true) {
    this.verbose = verbose;
  }

  /**
   * Log a message if verbose mode is enabled
   */
  log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }

  /**
   * Log a section header
   */
  logHeader(title: string): void {
    if (this.verbose) {
      console.log("\n" + chalk.bgBlue.white(` ${title} `) + "\n");
    }
  }

  /**
   * Log an info message with blue color
   */
  info(message: string): void {
    this.log(chalk.blue(message));
  }

  /**
   * Log a success message with green color
   */
  success(message: string): void {
    this.log(chalk.green(message));
  }

  /**
   * Log a warning message with yellow color
   */
  warn(message: string): void {
    this.log(chalk.yellow(message));
  }

  /**
   * Log an error message with red color
   */
  error(message: string): void {
    console.error(chalk.red(message));
  }

  /**
   * Start a spinner with a message
   */
  startSpinner(message: string): void {
    if (this.verbose) {
      this.spinner.start(message);
    }
  }

  /**
   * Stop the spinner with a success message
   */
  succeedSpinner(message: string): void {
    if (this.verbose) {
      this.spinner.succeed(message);
    }
  }

  /**
   * Stop the spinner with a warning message
   */
  warnSpinner(message: string): void {
    if (this.verbose) {
      this.spinner.warn(message);
    }
  }

  /**
   * Stop the spinner with an error message
   */
  failSpinner(message: string): void {
    if (this.verbose) {
      this.spinner.fail(message);
    }
  }

  /**
   * Log data metrics in a formatted way
   */
  logMetrics(label: string, metrics: Record<string, any>): void {
    this.log(chalk.cyan(`📏 ${label} metrics:`));
    Object.entries(metrics).forEach(([key, value]) => {
      this.log(chalk.cyan(`   ${key}: ${value}`));
    });
  }
}
