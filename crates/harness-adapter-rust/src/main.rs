fn main() {
    std::process::exit(harness_adapter_rust::run_cli(std::env::args().skip(1)));
}
