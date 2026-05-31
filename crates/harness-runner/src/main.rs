fn main() {
    std::process::exit(harness_runner::run_cli(std::env::args().skip(1)));
}
