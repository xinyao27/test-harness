fn main() {
    std::process::exit(harness_adapter_runtime::run_cli(std::env::args().skip(1)));
}
