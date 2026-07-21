{
  "targets": [
    {
      "target_name": "process_loopback",
      "sources": [
        "src/binding.cc",
        "src/pid_resolver.cc",
        "src/loopback_capture.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_VERSION=8"
      ],
      "conditions": [
        [
          "OS=='win'",
          {
            "libraries": [
              "mmdevapi.lib",
              "ole32.lib"
            ],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1
              }
            }
          }
        ]
      ]
    }
  ]
}
